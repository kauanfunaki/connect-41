// A situação de uma guia (Guias pelo Connect, 28/10/2026). Funções puras.
//
// A situação não é gravada: sai do que já existe, para não ficar velha.
// - PAGA: alguém marcou como paga (`pagaEm`);
// - VENCIDA: não paga e passou o último dia em que o banco aceita a guia —
//   o `validoAte` da guia recalculada, senão o vencimento;
// - ABERTA: o cliente abriu o envio que levou a guia (portal ou link do e-mail);
// - ENVIADA: o envio foi publicado e ninguém do cliente abriu ainda;
// - EMITIDA: está nos Arquivos, sem envio publicado.
//
// Vencida vem antes de aberta e enviada: guia vencida e não paga é o que o
// escritório precisa ver primeiro, tenha o cliente aberto ou não.

export type SituacaoDaGuia = "EMITIDA" | "ENVIADA" | "ABERTA" | "PAGA" | "VENCIDA";

export const ORDEM_DAS_SITUACOES: readonly SituacaoDaGuia[] = ["VENCIDA", "EMITIDA", "ENVIADA", "ABERTA", "PAGA"];

export const ROTULO_DA_SITUACAO: Record<SituacaoDaGuia, string> = {
  EMITIDA: "Emitida",
  ENVIADA: "Enviada",
  ABERTA: "Aberta pelo cliente",
  PAGA: "Paga",
  VENCIDA: "Vencida",
};

export type GuiaParaSituacao = {
  vencimento: string | null;
  validoAte: string | null;
  pagaEm: Date | null;
  envio: { publicado: boolean; abertoPeloCliente: boolean } | null;
};

/** `hoje` em "AAAA-MM-DD" (São Paulo). */
export function situacaoDaGuia(g: GuiaParaSituacao, hoje: string): SituacaoDaGuia {
  if (g.pagaEm) return "PAGA";
  const limite = g.validoAte ?? g.vencimento;
  if (limite && limite < hoje) return "VENCIDA";
  if (g.envio?.publicado && g.envio.abertoPeloCliente) return "ABERTA";
  if (g.envio?.publicado) return "ENVIADA";
  return "EMITIDA";
}

/** O mês a que a guia pertence na tela: o do vencimento; sem vencimento, a competência; sem os dois, o da emissão. */
export function mesDaGuia(g: { vencimento: string | null; competencia: string | null; emitidaEmKey: string }): string {
  return (g.vencimento ?? g.competencia ?? g.emitidaEmKey).slice(0, 7);
}

export function contarPorSituacao(situacoes: readonly SituacaoDaGuia[]): Record<SituacaoDaGuia, number> {
  const c: Record<SituacaoDaGuia, number> = { EMITIDA: 0, ENVIADA: 0, ABERTA: 0, PAGA: 0, VENCIDA: 0 };
  for (const s of situacoes) c[s]++;
  return c;
}
