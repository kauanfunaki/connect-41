// A produtividade por pessoa nos setores (05/11/2026, decisão do Kauan na
// página "Ajustes de 05/11": Gestão C — a produtividade primeiro, o mapa dos
// processos depois). Puro: parte dos mesmos itens de trabalho do painel
// (`ItemDeTrabalho`, processos, cards, pendências, transferências e
// solicitações) e das horas apontadas.
//
// O que se mede, por pessoa e por setor:
// - entregues no período (o item concluído em que ela responde), por origem;
// - no prazo: dos entregues que tinham prazo, quantos terminaram até o dia dele;
// - a carga de agora (em aberto, parados, vencidos) — a mesma conta dos Coordenadores;
// - as horas apontadas e quanto delas veio do cronômetro (e não à mão), que é
//   o rastro de 04/11 para não depender só da boa-fé de quem lança.
//
// Não compara setores entre si: cada setor entrega coisas diferentes (um
// processo societário não vale um card do BPO). A tela agrupa por setor.

import type { Classificacao, ItemDeTrabalho, Origem } from "./regras";

export type ProdutividadeDaPessoa = {
  userId: string;
  setor: string;
  entregues: number;
  porOrigem: Record<Origem, number>;
  /** Entregues que tinham prazo — a base do "no prazo". */
  comPrazo: number;
  noPrazo: number;
  emAberto: number;
  parados: number;
  vencidos: number;
  /** Minutos apontados no período e quantos deles pelo cronômetro. */
  minutos: number;
  minutosDoCronometro: number;
};

const ORIGENS: Origem[] = ["PROCESSO", "CARD", "PENDENCIA", "TRANSFERENCIA", "SOLICITACAO"];
const zeradas = (): Record<Origem, number> => Object.fromEntries(ORIGENS.map((o) => [o, 0])) as Record<Origem, number>;

/** O dia do calendário (São Paulo) de uma data, para "terminou até o dia do prazo". */
function diaEmSaoPaulo(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Terminou até o dia do prazo (o prazo é um dia, não uma hora). */
export function entregueNoPrazo(item: Pick<ItemDeTrabalho, "concluidoEm" | "prazo">): boolean | null {
  if (!item.concluidoEm || !item.prazo) return null;
  return diaEmSaoPaulo(item.concluidoEm) <= diaEmSaoPaulo(item.prazo);
}

export type HoraApontada = { userId: string; setor: string; minutos: number; origem: "CRONOMETRO" | "MANUAL" | null };

/**
 * Uma linha por pessoa e setor em que ela teve entrega, carga ou horas.
 * Item com mais de um responsável conta para cada um (todos responderam).
 */
export function produtividadePorPessoa(
  itens: readonly { item: ItemDeTrabalho; c: Classificacao }[],
  horas: readonly HoraApontada[],
  periodo: { de: Date; ate: Date },
): ProdutividadeDaPessoa[] {
  const linhas = new Map<string, ProdutividadeDaPessoa>();
  const linha = (userId: string, setor: string) => {
    const k = `${userId}:${setor}`;
    let l = linhas.get(k);
    if (!l) {
      l = { userId, setor, entregues: 0, porOrigem: zeradas(), comPrazo: 0, noPrazo: 0, emAberto: 0, parados: 0, vencidos: 0, minutos: 0, minutosDoCronometro: 0 };
      linhas.set(k, l);
    }
    return l;
  };

  for (const { item, c } of itens) {
    for (const userId of item.responsaveis) {
      if (item.estado === "CONCLUIDO") {
        if (!item.concluidoEm || item.concluidoEm < periodo.de || item.concluidoEm >= periodo.ate) continue;
        const l = linha(userId, item.setor);
        l.entregues++;
        l.porOrigem[item.origem]++;
        const prazo = entregueNoPrazo(item);
        if (prazo !== null) {
          l.comPrazo++;
          if (prazo) l.noPrazo++;
        }
      } else {
        const l = linha(userId, item.setor);
        l.emAberto++;
        if (c.coluna === "PARADO" && !c.paradoDeProposito) l.parados++;
        if (c.prazo?.situacao === "VENCIDO") l.vencidos++;
      }
    }
  }
  for (const h of horas) {
    const l = linha(h.userId, h.setor);
    l.minutos += h.minutos;
    if (h.origem === "CRONOMETRO") l.minutosDoCronometro += h.minutos;
  }
  return [...linhas.values()];
}

/** Porcentagem inteira, ou nulo sem base. */
export function porcentagem(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}
