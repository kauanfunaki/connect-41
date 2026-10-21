// O e-CNPJ A1 do contratante: abrir o .pfx com a senha e ler quem é e até quando vale.

import { createSecureContext } from "node:tls";
import { X509Certificate } from "node:crypto";
import { lerSujeitoDoCertificado } from "./regras";
import { converterPfxAntigo } from "./pkcs12";

export type CertificadoLido =
  | {
      ok: true;
      titular: string | null;
      cnpj: string | null;
      validoAte: string | null;
      /**
       * O mesmo certificado em formato moderno, quando o arquivo veio no
       * antigo (RC2): é o que se guarda e o que vai na conexão com o Serpro.
       */
      convertido?: Buffer;
    }
  | { ok: false; erro: string };

/** Teto do arquivo: um A1 tem poucos KB; 50 KB é folga, não limite de uso. */
export const TAMANHO_MAXIMO_DO_CERTIFICADO = 50 * 1024;

export const ERRO_DO_FORMATO_ANTIGO =
  "O certificado está num formato antigo (cifra RC2), que o servidor não abre. Exporte o .pfx de novo com cifra AES (no Windows, “AES256-SHA256”) e envie outra vez.";

/**
 * Abre o .pfx com a senha — é o mesmo que o Serpro vai fazer na conexão, então
 * senha errada aparece aqui, ao salvar, e não como 401 na primeira chamada.
 * Titular, CNPJ e validade saem do certificado; quando o Node não expõe o
 * certificado do contexto, ficam nulos e o resto segue.
 *
 * O A1 antigo, com os certificados em RC2, o OpenSSL 3 não abre (20/10/2026):
 * o erro é "Unsupported PKCS12 PFX data", e a senha já foi conferida pelo MAC
 * antes dele. Era lido como senha errada; agora o arquivo é convertido para o
 * formato moderno, e só se a conversão falhar a tela pede para reexportar.
 */
export function lerCertificado(pfx: Buffer, senha: string): CertificadoLido {
  let contexto: ReturnType<typeof createSecureContext>;
  let convertido: Buffer | undefined;
  try {
    contexto = createSecureContext({ pfx, passphrase: senha });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const codigo = (e as { code?: string } | null)?.code;
    if (/unsupported pkcs12 pfx data/i.test(msg) || codigo === "ERR_CRYPTO_UNSUPPORTED_OPERATION") {
      const c = converterPfxAntigo(pfx, senha);
      if (!c.ok) return { ok: false, erro: c.erro === "senha" ? "A senha não abre o certificado." : ERRO_DO_FORMATO_ANTIGO };
      try {
        contexto = createSecureContext({ pfx: c.pfx, passphrase: senha });
        convertido = c.pfx;
      } catch {
        return { ok: false, erro: ERRO_DO_FORMATO_ANTIGO };
      }
    } else if (/mac verify|bad decrypt|password/i.test(msg)) {
      return { ok: false, erro: "A senha não abre o certificado." };
    } else {
      return { ok: false, erro: "O arquivo não é um certificado .pfx válido." };
    }
  }
  const extra = convertido ? { convertido } : {};
  try {
    const der = (contexto.context as { getCertificate?: () => Buffer | null }).getCertificate?.();
    if (!der) return { ok: true, titular: null, cnpj: null, validoAte: null, ...extra };
    const x = new X509Certificate(der);
    const { titular, cnpj } = lerSujeitoDoCertificado(x.subject);
    return { ok: true, titular, cnpj, validoAte: new Date(x.validTo).toISOString().slice(0, 10), ...extra };
  } catch {
    return { ok: true, titular: null, cnpj: null, validoAte: null, ...extra };
  }
}
