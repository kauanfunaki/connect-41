// Certificados digitais (A1 e-CNPJ / e-CPF) — só metadado.
//
// Decisão de 23/09: nem o `.pfx` nem a senha entram no Connect. Eles continuam
// na pasta de rede e no cofre do KeePassXC; aqui fica o que o setor precisa para
// não deixar vencer: de quem é, quando vence e em qual entrada do cofre está a
// senha. O dado vem do relatório de `scripts/certificados/conferir-certificados.ps1`.
//
// **O nome do arquivo nunca é lido.** Na pasta da 41 ele carrega a senha entre
// parênteses — `EMPRESA (senha) 08.06.2027.pfx` —, então a importação descarta a
// coluna no navegador, antes de qualquer coisa chegar ao servidor.

import { diasAte } from "@/lib/societario/licencas";
import { lerDocumentoFiscal } from "@/lib/companyTaxId";

/** Marcos de aviso, em dias antes do vencimento (decisão de 23/09). */
export const FAIXAS_DE_AVISO = [60, 30, 15, 7] as const;
export type FaixaDeAviso = (typeof FAIXAS_DE_AVISO)[number] | "vencido";

export type SituacaoDoCertificado = "vencido" | "a_renovar" | "vigente" | "substituido";

export type CertificadoParaSituacao = { documento: string; expiresAt: Date };

/**
 * Em que faixa de aviso o certificado está hoje — a menor faixa que ainda cobre
 * os dias que faltam. Com 10 dias, a faixa é 15: o aviso de 60 e o de 30 já
 * passaram e não saem mais (quem importou tarde não recebe três avisos de uma
 * vez). `null` = longe de vencer.
 */
export function faixaDeAviso(expiresAt: Date, hoje: Date): FaixaDeAviso | null {
  const dias = diasAte(expiresAt, hoje);
  if (dias < 0) return "vencido";
  const cobre = FAIXAS_DE_AVISO.filter((f) => dias <= f);
  return cobre.length ? cobre[cobre.length - 1] : null;
}

/**
 * O certificado que vale para cada documento: o de vencimento mais distante.
 *
 * Renovar gera um arquivo novo e o antigo costuma ficar na pasta. Sem esta
 * regra, o antigo seguiria avisando "vencido" para sempre sobre uma empresa que
 * já renovou — e aviso que não pede ação ensina o setor a ignorar os outros.
 */
export function atuaisPorDocumento<T extends CertificadoParaSituacao>(certs: T[]): Map<string, T> {
  const atual = new Map<string, T>();
  for (const c of certs) {
    const outro = atual.get(c.documento);
    if (!outro || c.expiresAt > outro.expiresAt) atual.set(c.documento, c);
  }
  return atual;
}

export function situacaoDoCertificado(
  c: CertificadoParaSituacao,
  atual: CertificadoParaSituacao | undefined,
  hoje: Date
): SituacaoDoCertificado {
  if (atual && atual.expiresAt > c.expiresAt) return "substituido";
  const dias = diasAte(c.expiresAt, hoje);
  if (dias < 0) return "vencido";
  if (dias <= FAIXAS_DE_AVISO[0]) return "a_renovar";
  return "vigente";
}

export const ROTULO_DA_SITUACAO: Record<SituacaoDoCertificado, string> = {
  vencido: "Vencido",
  a_renovar: "A renovar",
  vigente: "Vigente",
  substituido: "Substituído",
};

// ─── Importação do relatório do script ─────────────────────────────────────

/** O que sai do navegador para o servidor — sem a coluna do arquivo. */
export type LinhaDeCertificado = {
  documento: string;
  titular: string;
  vencimento: string; // DD/MM/AAAA, como o script escreve
  entradaDoCofre: string;
  conferir: string;
};

const COLUNAS = {
  documento: "documento",
  titular: "titular",
  vencimento: "vencimento",
  entradaDoCofre: "entrada do cofre",
  conferir: "conferir",
} as const;

/**
 * Tira do CSV do script só as colunas que o Connect guarda. Roda no navegador:
 * a coluna "Arquivo" (que tem a senha no nome) é descartada aqui e não viaja.
 * Linha sem documento é certificado que o script não conseguiu abrir — sem
 * documento e sem vencimento não há o que controlar.
 */
export function extrairDoRelatorio(headers: string[], rows: string[][]): { linhas: LinhaDeCertificado[]; faltando: string[] } {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(Object.entries(COLUNAS).map(([k, nome]) => [k, norm.indexOf(nome)])) as Record<keyof typeof COLUNAS, number>;
  const faltando = (["documento", "titular", "vencimento"] as const).filter((k) => idx[k] < 0).map((k) => COLUNAS[k]);
  if (faltando.length) return { linhas: [], faltando };
  const cel = (r: string[], k: keyof typeof COLUNAS) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
  const linhas = rows
    .map((r) => ({
      documento: cel(r, "documento"),
      titular: cel(r, "titular"),
      vencimento: cel(r, "vencimento"),
      entradaDoCofre: cel(r, "entradaDoCofre"),
      conferir: cel(r, "conferir"),
    }))
    .filter((l) => l.documento && l.vencimento);
  return { linhas, faltando: [] };
}

export type CertificadoValidado = {
  tipo: "CNPJ" | "CPF";
  documento: string;
  titular: string;
  expiresAt: Date;
  cofreEntrada: string | null;
  conferir: string | null;
};

/** DD/MM/AAAA → meio-dia UTC do dia (fica no mesmo dia civil em qualquer fuso do Brasil). */
export function lerData(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, d, mes, a] = m.map(Number);
  const data = new Date(Date.UTC(a, mes - 1, d, 12));
  return data.getUTCDate() === d && data.getUTCMonth() === mes - 1 ? data : null;
}

/** Valida no servidor o que o navegador mandou. `null` = linha descartada. */
export function validarLinha(l: unknown): CertificadoValidado | null {
  if (!l || typeof l !== "object") return null;
  const o = l as Record<string, unknown>;
  const doc = lerDocumentoFiscal(String(o.documento ?? ""));
  const expiresAt = lerData(String(o.vencimento ?? ""));
  const titular = String(o.titular ?? "").trim().slice(0, 200);
  if (!doc || !expiresAt || !titular) return null;
  const texto = (x: unknown, max: number) => String(x ?? "").trim().slice(0, max) || null;
  return {
    tipo: doc.tipo,
    documento: doc.digitos,
    titular,
    expiresAt,
    cofreEntrada: texto(o.entradaDoCofre, 200),
    conferir: texto(o.conferir, 300),
  };
}

/** Mesmo certificado em mais de uma pasta vira um só: documento + vencimento é a identidade. */
export function chaveDoCertificado(c: { documento: string; expiresAt: Date }): string {
  return `${c.documento}:${c.expiresAt.toISOString().slice(0, 10)}`;
}
