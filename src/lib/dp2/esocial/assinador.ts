// O combinado entre o Connect (no navegador) e o Assinador do Connect, o
// programa do Windows que usa o certificado ligado no CertDigital (13/11/2026,
// funcionalidades 668 e 671). MEDIDA TEMPORÁRIA: sai quando a assinatura
// definitiva (CertificadoConnect ou certificado no servidor) entrar.
//
// O código do Assinador está em `ferramentas/assinador/`. Ele atende só em
// 127.0.0.1 e só aceita as origens do Connect (cabeçalho Origin).

export const ENDERECO_DO_ASSINADOR = "http://127.0.0.1:47141";

export type CertificadoNoWindows = {
  thumbprint: string;
  nome: string;
  /** CNPJ ou CPF do titular, só dígitos. */
  documento: string | null;
  validoAte: string;
  /** A chave abriu sem pedir nada: o certificado está ligado de verdade. */
  chaveAcessivel: boolean;
};

type Falha = { ok: false; erro: string };

export type StatusDoAssinador = { ok: true; versao: string; certificados: CertificadoNoWindows[] };
export type RespostaDaConsulta = { ok: true; certificado: string; cdResposta: number; descResposta: string; qtdeTotal: number | null; identificadores: { id: string; nrRec: string | null }[] } | Falha;
export type RespostaDoDownload = { ok: true; certificado: string; cdResposta: number; descResposta: string; xml: string } | Falha;

const SEM_ASSINADOR =
  "O Assinador do Connect não respondeu neste computador. Ele precisa estar instalado e aberto (peça ao TI).";

async function chamar<T>(caminho: string, corpo?: unknown, tempo = 4 * 60_000): Promise<T | Falha> {
  try {
    const r = await fetch(`${ENDERECO_DO_ASSINADOR}${caminho}`, {
      method: corpo === undefined ? "GET" : "POST",
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(tempo),
    });
    if (r.status === 403) return { ok: false, erro: "O Assinador recusou este endereço do Connect. Peça ao TI para conferir a configuração dele." };
    return (await r.json()) as T;
  } catch {
    return { ok: false, erro: SEM_ASSINADOR };
  }
}

export const statusDoAssinador = () => chamar<StatusDoAssinador>("/status", undefined, 3000);

export const consultarTrabalhador = (p: { cnpj: string; cpf: string; dtIni: string; dtFim: string; thumbprint: string }) =>
  chamar<RespostaDaConsulta>("/esocial/consultar-trabalhador", p);

export const baixarEventos = (p: { cnpj: string; ids: string[]; thumbprint: string }) => chamar<RespostaDoDownload>("/esocial/baixar", p);

/** O certificado que combina com a empresa (mesma raiz do CNPJ), se estiver ligado. */
export function certificadoDaEmpresa(certs: CertificadoNoWindows[], cnpj: string | null): CertificadoNoWindows | undefined {
  const raiz = (cnpj ?? "").replace(/\D/g, "").slice(0, 8);
  return certs.find((c) => c.chaveAcessivel && raiz.length === 8 && c.documento?.length === 14 && c.documento.startsWith(raiz));
}
