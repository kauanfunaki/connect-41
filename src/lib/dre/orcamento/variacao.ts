// Orçado × realizado: variação e a leitura "melhor/pior". Função pura.
//
// ─── Por que "melhor/pior" e não só o sinal ─────────────────────────────────
//
// A DRE guarda despesa negativa, então a diferença `realizado − orçado` já sai
// positiva quando a despesa ficou abaixo do orçado — é a mesma convenção de
// `compararResultados`. Mas quem lê "Var. −R$ 500" na linha de aluguel precisa
// saber se gastou mais ou menos, e cor por sinal ensinaria a regra errada na
// primeira receita. Então a avaliação é explícita, pela natureza da linha:
//
// - **receita** (grupo de recebimento): realizado acima do orçado é melhor;
// - **despesa** (grupo de pagamento): gasto acima do orçado é pior;
// - **resultado** (subtotal): acima do orçado é melhor.
//
// Numericamente as três coincidem com o sinal da diferença na convenção da
// DRE — o que os testes provam —, mas a regra fica escrita pelo que significa.

import { GRUPOS, LINHAS } from "@/lib/dre/estrutura";
import type { ResultadoDoDre } from "@/lib/dre/calculo";
import { valorDaLinha } from "@/lib/dre/economica";
import { LINHAS_DO_COMPARATIVO } from "@/lib/dre/analises";

export type NaturezaDaLinha = "receita" | "despesa" | "resultado";
export type Avaliacao = "melhor" | "pior" | "igual";

export type Variacao = {
  realizado: number;
  orcado: number;
  /** `realizado − orçado`, na convenção de sinal da DRE. */
  diferenca: number;
  /** Diferença sobre o |orçado|. `null` quando não há orçado — a tela mostra "—". */
  percentual: number | null;
  avaliacao: Avaliacao;
};

const ORIGEM = new Map(GRUPOS.map((g) => [g.code, g.origem]));

/** A natureza de uma linha de valor; `null` para as de percentual. */
export function naturezaDaLinha(code: string): NaturezaDaLinha | null {
  const linha = LINHAS.find((l) => l.code === code);
  if (!linha || linha.tipo === "percentual") return null;
  if (linha.tipo === "subtotal") return "resultado";
  return ORIGEM.get(linha.grupo) === "pagamento" ? "despesa" : "receita";
}

export function avaliar(natureza: NaturezaDaLinha, realizado: number, orcado: number): Avaliacao {
  if (realizado === orcado) return "igual";
  if (natureza === "despesa") {
    // Gasto em magnitude: a despesa vem negativa da DRE.
    const gasto = -realizado;
    const gastoOrcado = -orcado;
    return gasto > gastoOrcado ? "pior" : "melhor";
  }
  return realizado > orcado ? "melhor" : "pior";
}

export function variacao(code: string, realizado: number, orcado: number): Variacao {
  const natureza = naturezaDaLinha(code) ?? "resultado";
  const diferenca = realizado - orcado;
  return {
    realizado,
    orcado,
    diferenca,
    percentual: orcado === 0 ? null : diferenca / Math.abs(orcado),
    avaliacao: avaliar(natureza, realizado, orcado),
  };
}

/** A variação de cada linha de valor entre duas DREs montadas pelo mesmo motor. */
export function variacaoPorLinha(realizado: ResultadoDoDre, orcado: ResultadoDoDre): Map<string, Variacao> {
  const saida = new Map<string, Variacao>();
  for (const l of realizado.linhas) {
    if (l.tipo === "percentual") continue;
    saida.set(l.code, variacao(l.code, valorDaLinha(realizado, l.code), valorDaLinha(orcado, l.code)));
  }
  return saida;
}

/** Os meses do acumulado do ano até o mês (1 a 12), inclusive. */
export function mesesDoAcumulado(mes: number): number[] {
  const m = Math.min(12, Math.max(1, Math.trunc(mes)));
  return Array.from({ length: m }, (_, i) => i + 1);
}

/** As linhas do comparativo orçado × realizado — as mesmas do comparativo entre períodos. */
export const LINHAS_DO_ORCADO = LINHAS_DO_COMPARATIVO;
