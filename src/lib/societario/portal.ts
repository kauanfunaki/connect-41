// O processo societário como o cliente vê no portal. Funções puras.
//
// ─── O que o cliente vê, e o que fica só com a equipe ────────────────────────
//
// Vê: o tipo e o título do processo, a situação, a previsão do tipo, as etapas
// que se aplicam a ele, as exigências do órgão e as taxas.
//
// Não vê: observações internas, responsável, prioridade, checklist de cada
// etapa e o número de voltas. Prioridade e responsável são organização da
// equipe; voltas é métrica do setor. Mostrar qualquer um deles convida uma
// conversa que não é com o cliente ("por que o meu é prioridade normal?").
//
// A previsão sai sem juízo: "4 a 7 dias úteis, 9 até agora". A tela interna
// pinta de vermelho o que estourou; para o cliente, o atraso quase sempre é do
// órgão, e dizer "atrasado" sem dizer de quem é pior que dar os dois números.

import type { SituacaoDoProcesso, StatusDaEtapa, Prazo } from "./processo";

export type SituacaoParaCliente = SituacaoDoProcesso | "CANCELADO";

export const SITUACAO_PARA_CLIENTE: Record<SituacaoParaCliente, { rotulo: string; explicacao: string }> = {
  EM_ANDAMENTO: { rotulo: "Em andamento", explicacao: "A equipe está preparando o processo." },
  AGUARDANDO_ORGAO: { rotulo: "Aguardando o órgão", explicacao: "Já foi protocolado e está em análise no órgão." },
  EM_EXIGENCIA: {
    rotulo: "Exigência do órgão",
    explicacao: "O órgão pediu um ajuste. A equipe resolve e avisa se precisar de algo seu.",
  },
  CONCLUIDO: { rotulo: "Concluído", explicacao: "Processo encerrado." },
  CANCELADO: { rotulo: "Cancelado", explicacao: "Processo encerrado sem conclusão." },
};

export const VARIANTE_PARA_CLIENTE: Record<SituacaoParaCliente, "success" | "warning" | "info" | "danger"> = {
  EM_ANDAMENTO: "info",
  AGUARDANDO_ORGAO: "info",
  EM_EXIGENCIA: "warning",
  CONCLUIDO: "success",
  CANCELADO: "danger",
};

export function situacaoParaCliente(situacao: SituacaoDoProcesso, cancelado: boolean): SituacaoParaCliente {
  // Cancelado não tem `concludedAt`, então a situação derivada diria "em
  // andamento" — o que, para o cliente, seria prometer trabalho que parou.
  return cancelado ? "CANCELADO" : situacao;
}

/** "4 a 7 dias úteis · 3 até agora"; sem previsão, só o que já passou. */
export function textoDaPrevisao(prazo: Prazo, concluido: boolean): string {
  const decorridos = `${prazo.dias} ${prazo.dias === 1 ? "dia útil" : "dias úteis"}`;
  const feito = concluido ? `levou ${decorridos}` : `${decorridos} até agora`;
  if (prazo.previstoMin === null && prazo.previstoMax === null) return `Prazo depende do órgão · ${feito}`;
  const min = prazo.previstoMin ?? prazo.previstoMax;
  const max = prazo.previstoMax ?? prazo.previstoMin;
  const previsto = min === max ? `${min} dias úteis` : `${min} a ${max} dias úteis`;
  return `Previsão de ${previsto} · ${feito}`;
}

export type EtapaParaCliente = { posicao: number; rotulo: string; orgao: string | null; status: StatusDaEtapa };

export const STATUS_DA_ETAPA_PARA_CLIENTE: Record<Exclude<StatusDaEtapa, "DISPENSADA">, string> = {
  PENDENTE: "A fazer",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
};

/**
 * As etapas na ordem do roteiro, sem as dispensadas. Etapa dispensada é "não
 * se aplica a este processo" — para o cliente, uma linha riscada só pergunta
 * "por que não?".
 */
export function etapasParaCliente(etapas: EtapaParaCliente[]): EtapaParaCliente[] {
  return etapas.filter((e) => e.status !== "DISPENSADA").sort((a, b) => a.posicao - b.posicao);
}

/** Quantas das etapas que se aplicam já estão concluídas. */
export function progressoDasEtapas(etapas: EtapaParaCliente[]): { feitas: number; total: number } {
  const validas = etapasParaCliente(etapas);
  return { feitas: validas.filter((e) => e.status === "CONCLUIDA").length, total: validas.length };
}
