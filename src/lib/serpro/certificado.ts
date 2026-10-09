// O e-CNPJ A1 do contratante: abrir o .pfx com a senha e ler quem é e até quando vale.

import { createSecureContext } from "node:tls";
import { X509Certificate } from "node:crypto";
import { lerSujeitoDoCertificado } from "./regras";

export type CertificadoLido =
  | { ok: true; titular: string | null; cnpj: string | null; validoAte: string | null }
  | { ok: false; erro: string };

/** Teto do arquivo: um A1 tem poucos KB; 50 KB é folga, não limite de uso. */
export const TAMANHO_MAXIMO_DO_CERTIFICADO = 50 * 1024;

/**
 * Abre o .pfx com a senha — é o mesmo que o Serpro vai fazer na conexão, então
 * senha errada aparece aqui, ao salvar, e não como 401 na primeira chamada.
 * Titular, CNPJ e validade saem do certificado; quando o Node não expõe o
 * certificado do contexto, ficam nulos e o resto segue.
 */
export function lerCertificado(pfx: Buffer, senha: string): CertificadoLido {
  let contexto: ReturnType<typeof createSecureContext>;
  try {
    contexto = createSecureContext({ pfx, passphrase: senha });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/mac verify|bad decrypt|password|pkcs12/i.test(msg)) return { ok: false, erro: "A senha não abre o certificado." };
    return { ok: false, erro: "O arquivo não é um certificado .pfx válido." };
  }
  try {
    const der = (contexto.context as { getCertificate?: () => Buffer | null }).getCertificate?.();
    if (!der) return { ok: true, titular: null, cnpj: null, validoAte: null };
    const x = new X509Certificate(der);
    const { titular, cnpj } = lerSujeitoDoCertificado(x.subject);
    return { ok: true, titular, cnpj, validoAte: new Date(x.validTo).toISOString().slice(0, 10) };
  } catch {
    return { ok: true, titular: null, cnpj: null, validoAte: null };
  }
}
