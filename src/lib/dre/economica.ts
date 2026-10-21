// A DRE econômica — por competência. Função pura, sem banco.
//
// ─── Mesma estrutura, outro recorte ──────────────────────────────────────────
//
// A DRE que já existe (`/dre`) é de caixa: soma o que foi pago no mês. Esta
// soma o que **pertence** ao mês — `FinanceEntry.competence` —, pago ou não.
//
// A estrutura é a mesma de `estrutura.ts`, com os mesmos grupos, o mesmo
// de-para e o mesmo `calcularDre`. Duas estruturas de DRE fariam "margem de
// contribuição" significar coisas diferentes nas duas telas, e a comparação
// econômico × financeiro deixaria de comparar a mesma coisa.
//
// O que muda é o nome das duas linhas de resultado: numa leitura de competência,
// "gerador de caixa" e "resultado líquido operacional" seriam nomes errados para o
// mesmo número. `comRotulosEconomicos` troca só o rótulo; a conta é idêntica.
//
// ─── O que não entra ─────────────────────────────────────────────────────────
//
// - **cancelado** — deixou de existir para efeito de resultado. **Menos** o
//   renegociado e o perdido, que continuam receita na competência deles, e com
//   a **parcela de acordo** de fora — ver `src/lib/financeiro/cobranca/dre.ts`;
// - **o import do Omie** — é export de pagamentos e recebimentos, só tem data
//   de caixa. Não há competência nele para somar.

import {
  calcularDre,
  type LancamentoDoDre,
  type Mapeamento,
  type ResultadoDoDre,
  type ValorDaLinha,
} from "./calculo";
import { LINHA_DO_RESULTADO, MODELOS, OPCOES_PADRAO, modeloDoCodigo, type ModeloDoDre, type OpcoesDoDre } from "./estrutura";
import {
  contaNaDreEconomica,
  resumoDaCobrancaNaDre,
  type ResumoDaCobrancaNaDre,
} from "@/lib/financeiro/cobranca/dre";

export type LancamentoFinanceiro = {
  kind: "PAGAR" | "RECEBER";
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  /** Sempre positivo, como vem do banco. */
  centavos: number;
  categoria: string | null;
  /** Por que saiu do em aberto, quando `CANCELADO`. Nulo é o cancelado comum. */
  closeReason?: "CANCELADO" | "RENEGOCIADO" | "PERDA" | null;
  /** Parcela de acordo de cobrança — não é receita, é recebimento. */
  parcelaDeAcordo?: boolean;
  /** Centro de custo do lançamento. Nulo é "sem centro de custo". */
  centroDeCustoId?: string | null;
};

/**
 * O lançamento no formato que `calcularDre` consome.
 *
 * O sinal sai do tipo — pagamento negativo, recebimento positivo — que é a
 * convenção do cabeçalho de `calculo.ts`: toda linha de subtotal é soma.
 */
export function paraLancamentoDoDre(
  l: Pick<LancamentoFinanceiro, "kind" | "centavos" | "categoria" | "centroDeCustoId">
): LancamentoDoDre {
  return {
    categoria: l.categoria,
    valorCentavos: l.kind === "PAGAR" ? -l.centavos : l.centavos,
    origem: l.kind === "PAGAR" ? "pagamento" : "recebimento",
    ...(l.centroDeCustoId !== undefined ? { centroDeCustoId: l.centroDeCustoId } : {}),
  };
}

export type DreEconomica = {
  resultado: ResultadoDoDre;
  lancamentos: number;
  /**
   * Quantos ainda estão `PROVISORIO` — propostos a partir de nota e não
   * conferidos. Eles **entram** no resultado (a obrigação existe), e a tela
   * precisa dizer quantos são, porque é o pedaço do número que ninguém olhou.
   */
  provisorios: number;
  /** Quanto das outras receitas e despesas é acordo e perda de cobrança. */
  cobranca: ResumoDaCobrancaNaDre;
};

/**
 * A DRE de competência de um conjunto de lançamentos já recortado pelo mês.
 *
 * `ajustes` são os lançamentos de grupo fixo que a cobrança acrescenta ao mês
 * (diferença de acordo e perda) — `ajustesDaCobranca`. Não contam em
 * `lancamentos`: não são lançamento de ninguém, e o forecast usa essa contagem
 * para achar o primeiro mês com movimento.
 */
export function calcularDreEconomica(
  lancamentos: LancamentoFinanceiro[],
  mapeamento: Mapeamento,
  opcoes: OpcoesDoDre = OPCOES_PADRAO,
  ajustes: LancamentoDoDre[] = []
): DreEconomica {
  const validos = lancamentos.filter(contaNaDreEconomica);
  return {
    resultado: calcularDre([...validos.map(paraLancamentoDoDre), ...ajustes], mapeamento, opcoes),
    lancamentos: validos.length,
    provisorios: validos.filter((l) => l.status === "PROVISORIO").length,
    cobranca: resumoDaCobrancaNaDre(ajustes),
  };
}

// Os rótulos de competência de todos os modelos juntos: os códigos das linhas
// de resultado não se repetem entre eles ("ebitda" no padrão, "gerador_de_caixa"
// no por área), então a troca não precisa saber o modelo.
const ROTULOS_ECONOMICOS: Record<string, string> = Object.assign({}, ...MODELOS.map((m) => m.rotulosEconomicos));

/** Rótulo da linha lido como competência. */
export function rotuloEconomico(code: string, rotuloOriginal: string): string {
  return ROTULOS_ECONOMICOS[code] ?? rotuloOriginal;
}

/** O mesmo resultado, com as linhas de "caixa" renomeadas para leitura de competência. */
export function comRotulosEconomicos(r: ResultadoDoDre): ResultadoDoDre {
  return {
    ...r,
    linhas: r.linhas.map((l: ValorDaLinha) => ({ ...l, label: rotuloEconomico(l.code, l.label) })),
  };
}

/** Valor em centavos de uma linha; zero quando a linha é percentual ou não existe. */
export function valorDaLinha(r: ResultadoDoDre, code: string): number {
  return r.linhas.find((l) => l.code === code)?.centavos ?? 0;
}

/** Fração de uma linha percentual; `null` quando não dá para calcular. */
export function fracaoDaLinha(r: ResultadoDoDre, code: string): number | null {
  return r.linhas.find((l) => l.code === code)?.fracao ?? null;
}

/** A linha de resultado final do padrão — o resultado líquido operacional. */
export const LINHA_DE_RESULTADO = LINHA_DO_RESULTADO;
/** A linha operacional do padrão — o gerador de caixa (EBITDA). */
export const LINHA_OPERACIONAL = "ebitda";

/** O modelo de um resultado — o padrão quando ele não diz (21/10/2026). */
export function modeloDoResultado(r: ResultadoDoDre): ModeloDoDre {
  return modeloDoCodigo(r.modelo);
}

/** A linha de resultado final do modelo do resultado. */
export function linhaDeResultadoDe(r: ResultadoDoDre): string {
  return modeloDoResultado(r).linhaDoResultado;
}

/** A linha operacional do modelo do resultado. */
export function linhaOperacionalDe(r: ResultadoDoDre): string {
  return modeloDoResultado(r).linhaOperacional;
}
