// O dono de uma sessão de upload em partes (API-CONNECT §14.4), 23/10/2026.
//
// O motor isola a sessão por raiz (sessão de outra raiz é 404), mas não sabe
// quem, dentro do Connect, a abriu: o token de escrita é um só por escritório.
// Sem isto, qualquer pessoa do escritório com `agir` em Documentos — ou de
// outro escritório que alcance a mesma raiz — poderia mandar parte, concluir
// ou apagar o envio de outra, sabendo o id.
//
// ─── Por que token assinado, e não tabela ───────────────────────────────────
//
// A sessão vive no máximo `CONNECT_UPLOAD_TTL_H` (24 h por padrão) e quem a
// usa é só a aba que a abriu. Um token HMAC que amarra `id ↔ escritório ↔
// raiz ↔ usuário ↔ validade` resolve sem migração, sem escrita no banco a
// cada parte (até 63 por envio) e sem limpeza de linhas vencidas. O segredo é
// o que o Connect já tem (`JWT_ACCESS_SECRET`), derivado para este uso — como
// o carimbo anti-robô de `carreiras/antiRobo.ts` —, então um token de sessão
// nunca vale como token de upload, nem o contrário. O custo: não dá para
// revogar um token antes da validade; o DELETE apaga a sessão no motor, e
// aí o token não serve para mais nada.
//
// O token vai ao navegador, que o devolve em `X-Upload-Token` a cada chamada.
// Não é credencial do motor (essas nunca saem do servidor): sozinho, sem a
// sessão do usuário que ele nomeia, não abre nada.

import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

export type DonoDoUpload = { id: string; tenantId: string; raiz: string; userId: string };

/** Validade máxima, para o caso de o motor não mandar `expira_em`. */
const VALIDADE_PADRAO_S = 24 * 3600;

function chave(segredo = process.env.JWT_ACCESS_SECRET): string {
  if (!segredo) throw new Error("Missing env var: JWT_ACCESS_SECRET");
  return `${segredo}:sped-upload-em-partes`;
}

const assinar = (carga: string, segredo?: string) => createHmac("sha256", chave(segredo)).update(carga).digest("base64url");

/** `expiraEm` é o `expira_em` da sessão no motor; o token não vale além dele nem de 24 h. */
export function emitirTokenDoUpload(dono: DonoDoUpload, expiraEm: string | null, agora = Date.now(), segredo?: string): string {
  const teto = Math.floor(agora / 1000) + VALIDADE_PADRAO_S;
  const doMotor = expiraEm ? Math.floor(Date.parse(expiraEm) / 1000) : NaN;
  const exp = Number.isFinite(doMotor) ? Math.min(doMotor, teto) : teto;
  const carga = Buffer.from(JSON.stringify({ v: 1, id: dono.id, t: dono.tenantId, r: dono.raiz, u: dono.userId, exp }), "utf8").toString("base64url");
  return `${carga}.${assinar(carga, segredo)}`;
}

export type VeredictoDoToken = "ok" | "ausente" | "invalido" | "vencido" | "de_outro";

/** Confere assinatura, validade e que o token é desta sessão, deste escritório, desta raiz e deste usuário. */
export function conferirTokenDoUpload(token: string | null, esperado: DonoDoUpload, agora = Date.now(), segredo?: string): VeredictoDoToken {
  if (!token) return "ausente";
  const [carga, assinatura, ...resto] = token.split(".");
  if (!carga || !assinatura || resto.length) return "invalido";
  const certa = Buffer.from(assinar(carga, segredo));
  const veio = Buffer.from(assinatura);
  if (certa.length !== veio.length || !timingSafeEqual(certa, veio)) return "invalido";
  let d: { v?: number; id?: string; t?: string; r?: string; u?: string; exp?: number };
  try {
    d = JSON.parse(Buffer.from(carga, "base64url").toString("utf8"));
  } catch {
    return "invalido";
  }
  if (d.v !== 1 || typeof d.exp !== "number") return "invalido";
  if (d.exp * 1000 <= agora) return "vencido";
  if (d.id !== esperado.id || d.t !== esperado.tenantId || d.r !== esperado.raiz || d.u !== esperado.userId) return "de_outro";
  return "ok";
}
