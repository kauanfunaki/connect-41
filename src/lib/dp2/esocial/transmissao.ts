// A assinatura e o envio dos lotes do eSocial (12/11/2026, DP 2 fase 3a).
//
// Decisão do Victor em 12/11/2026: fica para depois. Os caminhos em aberto
// são o CertificadoConnect (o app do Windows que guarda a chave e assina a
// pedido do Connect) ou o certificado do escritório guardado cifrado no
// servidor. Esta é a peça em que a escolha se encaixa: quem gera os eventos
// (`eventos.ts`) e a fila (`servidor.ts`) não mudam.

export type ResultadoDoEnvio = { ok: true; protocolo: string } | { ok: false; erro: string };

export interface TransmissorDoEsocial {
  /** Assina cada evento (XMLDSig, RSA-SHA256) e envia o lote ao webservice do eSocial. */
  enviarLote(lote: { grupo: "1" | "2" | "3"; eventos: { idEvento: string; xml: string }[] }): Promise<ResultadoDoEnvio>;
}

export const TRANSMISSAO_PENDENTE =
  "O envio ao eSocial ainda não está ligado: falta decidir onde o certificado assina (CertificadoConnect ou certificado no servidor). Por enquanto, gere, confira e baixe os eventos.";

/** O transmissor de hoje: recusa com o motivo, sem tocar no governo. */
export const transmissorPendente: TransmissorDoEsocial = {
  async enviarLote() {
    return { ok: false, erro: TRANSMISSAO_PENDENTE };
  },
};
