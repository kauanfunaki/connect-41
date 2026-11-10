import "server-only";

// O comprovante da prévia de importação (Fase 3b, 10/11/2026). No original, a análise de um
// arquivo de regras ou de contrapartes devolve um JWT de 15 minutos que amarra o tipo da
// importação, a pessoa, a empresa, o SHA-256 do arquivo e o hash da própria análise. A confirmação
// reenvia o arquivo, refaz a análise dentro da trava e só grava se tudo ainda bater: nada do que o
// navegador devolve é confiado, e uma prévia velha (cadastro mudou no meio) é recusada.
//
// Aqui o comprovante é um HMAC com o segredo que o Connect já tem (`JWT_ACCESS_SECRET`), derivado
// para este uso, como o `fiscal/motor/tokenDoUpload.ts`: um token de sessão nunca vale como
// comprovante, nem o contrário. Ele também amarra o escritório.

import { createHash, createHmac, timingSafeEqual } from "crypto";

const VALIDADE_S = 15 * 60;

function chave(segredo = process.env.JWT_ACCESS_SECRET): string {
  if (!segredo) throw new Error("Missing env var: JWT_ACCESS_SECRET");
  return `${segredo}:contabil-core-previa-de-importacao`;
}
const assinar = (carga: string, segredo?: string) => createHmac("sha256", chave(segredo)).update(carga).digest("base64url");

export type DadosDaPrevia = {
  /** "regras" | "contrapartes": um comprovante de um tipo não serve para o outro. */
  tipo: string;
  tenantId: string;
  userId: string;
  empresaId: string;
  arquivoHash: string;
  analiseHash: string;
  /** O que mais a confirmação precisa repetir igual (ex.: a conta bancária escolhida na tela). */
  extra?: string;
};

export function emitirComprovante(d: DadosDaPrevia, agora = Date.now(), segredo?: string): string {
  const exp = Math.floor(agora / 1000) + VALIDADE_S;
  const carga = Buffer.from(JSON.stringify({ v: 1, ...d, extra: d.extra ?? "", exp }), "utf8").toString("base64url");
  return `${carga}.${assinar(carga, segredo)}`;
}

export type VeredictoDaPrevia = { ok: true } | { ok: false; motivo: "invalida" | "expirada" | "de_outro" | "arquivo" | "desatualizada" };

/** Confere o comprovante contra o que a confirmação acabou de recalcular. */
export function conferirComprovante(token: string | null, esperado: DadosDaPrevia, agora = Date.now(), segredo?: string): VeredictoDaPrevia {
  if (!token) return { ok: false, motivo: "invalida" };
  const [carga, assinatura, ...resto] = token.split(".");
  if (!carga || !assinatura || resto.length) return { ok: false, motivo: "invalida" };
  const certa = Buffer.from(assinar(carga, segredo));
  const veio = Buffer.from(assinatura);
  if (certa.length !== veio.length || !timingSafeEqual(certa, veio)) return { ok: false, motivo: "invalida" };
  let d: Partial<DadosDaPrevia> & { v?: number; exp?: number };
  try {
    d = JSON.parse(Buffer.from(carga, "base64url").toString("utf8"));
  } catch {
    return { ok: false, motivo: "invalida" };
  }
  if (d.v !== 1 || typeof d.exp !== "number" || d.tipo !== esperado.tipo) return { ok: false, motivo: "invalida" };
  if (d.exp * 1000 <= agora) return { ok: false, motivo: "expirada" };
  if (d.tenantId !== esperado.tenantId || d.userId !== esperado.userId || d.empresaId !== esperado.empresaId || (d.extra ?? "") !== (esperado.extra ?? "")) {
    return { ok: false, motivo: "de_outro" };
  }
  if (d.arquivoHash !== esperado.arquivoHash) return { ok: false, motivo: "arquivo" };
  if (d.analiseHash !== esperado.analiseHash) return { ok: false, motivo: "desatualizada" };
  return { ok: true };
}

/** O hash da análise: JSON com chaves ordenadas, como o `json.dumps(..., sort_keys=True)` do original. */
export function hashDaAnalise(valor: unknown): string {
  return createHash("sha256").update(jsonOrdenado(valor), "utf8").digest("hex");
}

function jsonOrdenado(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(jsonOrdenado).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonOrdenado(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** A frase de cada recusa, como as do original. */
export const FRASE_DA_PREVIA: Record<Exclude<VeredictoDaPrevia, { ok: true }>["motivo"], string> = {
  invalida: "A prévia é inválida. Analise o arquivo novamente antes de importar.",
  expirada: "A prévia expirou. Analise o arquivo novamente antes de importar.",
  de_outro: "A prévia não pertence a esta pessoa, empresa ou escolha. Gere uma nova prévia antes de importar.",
  arquivo: "O arquivo selecionado não é o mesmo que foi analisado. Gere uma nova prévia antes de importar.",
  desatualizada: "Os dados da prévia mudaram desde a análise. Gere uma nova prévia antes de importar.",
};
