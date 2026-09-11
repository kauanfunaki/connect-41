// Quanto custou uma chamada de IA.
//
// ─── A regra que desenha este arquivo ───────────────────────────────────────
//
// **Preço desconhecido devolve `null`, e `null` nunca vira zero.**
//
// É a única decisão que importa aqui. Um modelo fora da tabela — porque é novo,
// porque um cliente pôs override apontando para outra coisa, porque o provedor
// renomeou — tratado como custo zero produz um teto que não segura nada, e a
// falha só aparece na fatura do mês seguinte. Devolvendo `null`, a chamada fica
// registrada com custo desconhecido, `saudeDoAgente` levanta a mão, e o teto de
// **chamadas** (que não depende de preço nenhum) continua protegendo.

/**
 * Preço por milhão de tokens, em dólares.
 *
 * ⚠️ **Conferir antes de confiar no teto em reais.** Estes valores foram
 * escritos em 11/09/2026 a partir do que estava publicado, e preço de modelo é
 * a coisa que mais muda neste sistema. Enquanto ninguém conferir contra a
 * página de preços do provedor, o número que protege de verdade é o teto de
 * chamadas.
 *
 * Modelo fora desta tabela não é erro: é custo desconhecido, e o resto do
 * sistema sabe lidar com isso.
 */
export const PRECO_POR_MILHAO_USD: Record<string, { entrada: number; saida: number }> = {
  "claude-haiku-4-5-20251001": { entrada: 1, saida: 5 },
  "claude-sonnet-5": { entrada: 3, saida: 15 },
  "claude-opus-5": { entrada: 15, saida: 75 },
  "gpt-4.1-mini": { entrada: 0.4, saida: 1.6 },
  "gpt-4.1": { entrada: 2, saida: 8 },
};

export const PRECOS_ESCRITOS_EM = "2026-09-11";

export type UsoDeTokens = {
  entrada: number;
  saida: number;
};

/**
 * O custo de uma chamada, em centavos de real.
 *
 * `cotacaoUsdEmCentavos` é parâmetro, e não constante, porque é a metade do
 * cálculo que envelhece sozinha — e porque deixá-la aqui dentro faria o teste
 * depender de câmbio.
 *
 * Arredonda para cima: custo em centavos truncado para baixo, somado ao longo
 * de milhares de chamadas pequenas, é como um mês fecha abaixo do teto e a
 * fatura vem acima.
 */
export function custoEmCentavos(
  model: string,
  uso: UsoDeTokens,
  cotacaoUsdEmCentavos: number
): number | null {
  const preco = PRECO_POR_MILHAO_USD[model];
  if (!preco) return null;
  if (!Number.isFinite(uso.entrada) || !Number.isFinite(uso.saida)) return null;
  if (uso.entrada < 0 || uso.saida < 0) return null;

  const dolares = (uso.entrada / 1_000_000) * preco.entrada + (uso.saida / 1_000_000) * preco.saida;
  return Math.ceil(dolares * cotacaoUsdEmCentavos);
}

/** O modelo tem preço conhecido? É o que a tela usa para avisar antes de gastar. */
export function temPrecoConhecido(model: string): boolean {
  return model in PRECO_POR_MILHAO_USD;
}

export type GastoDoMes = {
  /** Soma dos custos conhecidos, em centavos. */
  centavos: number;
  /** Quantas chamadas houve — conhecidas e desconhecidas. */
  chamadas: number;
  /** Quantas dessas ficaram sem custo apurado. */
  semCusto: number;
};

/**
 * Soma o mês a partir das linhas de execução.
 *
 * Separa `semCusto` em vez de ignorá-lo porque é a informação que decide se o
 * total significa alguma coisa: "R$ 40 no mês" com trinta chamadas sem custo
 * apurado não é R$ 40, é um número que não sabemos.
 */
export function somarGasto(linhas: { costCents: number | null }[]): GastoDoMes {
  let centavos = 0;
  let semCusto = 0;
  for (const l of linhas) {
    if (l.costCents === null) semCusto++;
    else centavos += l.costCents;
  }
  return { centavos, chamadas: linhas.length, semCusto };
}
