// Regras puras das telas da Cobrança A (04/11/2026): em que grupo da fila cada
// título cai e o andamento de cada acordo. Sem Prisma — a página e os
// componentes cliente importam daqui.

import type { ProximaAcao, SituacaoDeCobranca } from "./regras";

export type GrupoDaFila = "hoje" | "semContato" | "aguardando" | "semAcao" | "parados";

/** Na ordem da tela: por onde começar o dia. */
export const GRUPOS_DA_FILA: { chave: GrupoDaFila; rotulo: string; explicacao: string }[] = [
  { chave: "hoje", rotulo: "Ligar hoje", explicacao: "A próxima ação é hoje ou já passou." },
  { chave: "semContato", rotulo: "Sem contato", explicacao: "Vencidos que ninguém cobrou ainda." },
  { chave: "semAcao", rotulo: "Em cobrança, sem próxima ação", explicacao: "Já houve contato, mas nada ficou agendado." },
  { chave: "aguardando", rotulo: "Aguardando o sacado", explicacao: "Prometeu pagar ou tem retorno marcado para outro dia." },
  { chave: "parados", rotulo: "Contestados, em acordo e perdas", explicacao: "Fora da cobrança do dia." },
];

/**
 * O grupo do título na fila. A próxima ação vencida manda: quem prometeu pagar
 * ontem e não pagou volta para "Ligar hoje".
 */
export function grupoDaFila(l: { situacao: SituacaoDeCobranca | null; acao: ProximaAcao }): GrupoDaFila {
  if (l.situacao === "CONTESTADO" || l.situacao === "EM_ACORDO" || l.situacao === "PERDA" || l.situacao === null) return "parados";
  if (l.acao.paraHoje) return "hoje";
  if (l.situacao === "VENCIDO_SEM_CONTATO") return "semContato";
  if (l.situacao === "PROMETEU_PAGAR" || l.acao.quandoKey) return "aguardando";
  return "semAcao";
}

export type ParcelaParaAndamento = {
  valorCentavos: number;
  /** `AAAA-MM-DD` em São Paulo. */
  vencimentoKey: string;
  pago: boolean;
  /** Cancelada, renegociada ou baixada por perda: não conta como a pagar. */
  encerrada: boolean;
};

export type AndamentoDoAcordo = {
  pagas: number;
  total: number;
  /** A primeira parcela ainda a pagar, na ordem do vencimento. */
  proxima: { vencimentoKey: string; valorCentavos: number; vencida: boolean } | null;
  vencidas: number;
  emAbertoCentavos: number;
};

export function andamentoDoAcordo(parcelas: ParcelaParaAndamento[], hojeKey: string): AndamentoDoAcordo {
  const abertas = parcelas.filter((p) => !p.pago && !p.encerrada).sort((a, b) => a.vencimentoKey.localeCompare(b.vencimentoKey));
  const primeira = abertas[0];
  return {
    pagas: parcelas.filter((p) => p.pago).length,
    total: parcelas.length,
    proxima: primeira ? { vencimentoKey: primeira.vencimentoKey, valorCentavos: primeira.valorCentavos, vencida: primeira.vencimentoKey < hojeKey } : null,
    vencidas: abertas.filter((p) => p.vencimentoKey < hojeKey).length,
    emAbertoCentavos: abertas.reduce((s, p) => s + p.valorCentavos, 0),
  };
}
