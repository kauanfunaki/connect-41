// A estrutura do DRE, como a 41 o monta.
//
// Traduzida da planilha `10-DRE Irriga_2025_010.xlsx`, lida em 11/09/2026 —
// das abas `Formato` (o modelo teórico) e `DRE FINANCEIRO 2025` (o cálculo de
// verdade, célula por célula).
//
// ─── O que é fixo e o que é por cliente ─────────────────────────────────────
//
// **Fixo, e por isso mora em código:** os 12 grupos, as linhas do relatório, e
// as contas entre elas. É o modelo gerencial da 41, e a aba `Formato` prova
// isso — ela descreve o formato sem citar uma única categoria.
//
// **Por cliente, e por isso mora em tabela:** o de-para de categoria para
// grupo. As categorias da planilha são da Irriga ("Tubo Helicoidal",
// "Salários - Tracz"); outra empresa terá as dela.
//
// ─── Regime de caixa ────────────────────────────────────────────────────────
//
// O DRE inteiro sai de duas exportações do Omie por mês — pagamentos e
// recebimentos — somadas pela coluna "Valor Pago"/"Recebido", na data do
// extrato. **Não é competência.** No Connect a fonte equivalente é o
// lançamento com `paidAt` preenchido.

/** De onde o valor de um grupo vem. */
export type OrigemDoGrupo = "recebimento" | "pagamento";

export type GrupoDoDre = {
  code: string;
  label: string;
  origem: OrigemDoGrupo;
};

/**
 * Os 12 grupos que recebem categorias.
 *
 * A ordem é a do relatório. `origem` existe porque o mesmo nome de categoria
 * pode aparecer dos dois lados no Omie — e somar um recebimento dentro de um
 * grupo de despesa é o erro que produz um número plausível e errado.
 */
export const GRUPOS: GrupoDoDre[] = [
  { code: "receita_bruta", label: "Receita Bruta", origem: "recebimento" },
  { code: "impostos", label: "Impostos sobre Receita Bruta", origem: "pagamento" },
  { code: "cmv", label: "CMV sobre Receita Bruta", origem: "pagamento" },
  { code: "mao_de_obra", label: "Mão de Obra sobre Receita Bruta", origem: "pagamento" },
  { code: "comerciais", label: "Despesas Fixas (Comerciais)", origem: "pagamento" },
  { code: "pessoal", label: "Despesas Fixas (Pessoal)", origem: "pagamento" },
  { code: "diretoria", label: "Despesas Fixas (Diretoria)", origem: "pagamento" },
  { code: "administrativas", label: "Despesas Fixas (Administrativas)", origem: "pagamento" },
  { code: "financeiras", label: "Despesas Fixas (Financeiras)", origem: "pagamento" },
  { code: "investimentos", label: "Investimentos Totais", origem: "pagamento" },
  { code: "outras_receitas", label: "Outras Receitas Totais", origem: "recebimento" },
  {
    code: "outras_despesas",
    label: "Outras Despesas Totais (Receitas e Despesas Não Operacionais)",
    origem: "pagamento",
  },
];

export function grupoPorCodigo(code: string): GrupoDoDre | null {
  return GRUPOS.find((g) => g.code === code) ?? null;
}

/**
 * O grupo que recebe o que não foi classificado.
 *
 * **Não é um dos doze.** Ele existe para que dinheiro sem de-para apareça no
 * relatório em vez de sumir — que é o que a planilha faz hoje: em outubro/2025,
 * R$ 64.212,71 entraram na conta e não estão em linha nenhuma, porque o `SUMIF`
 * simplesmente não encontra categoria que não está na lista.
 *
 * Ele não entra em nenhuma conta de resultado. Serve para ser visto e zerado.
 */
export const NAO_CLASSIFICADO = "nao_classificado";

/**
 * Transferência entre contas da própria empresa.
 *
 * ─── CHUTE, 11/09 — reversível ──────────────────────────────────────────────
 *
 * "Entrada de Transferência" e "Saída de Transferência" aparecem no extrato e
 * **não são resultado**: é dinheiro andando entre contas do mesmo dono. A
 * planilha as deixa de fora sem dizer, e elas caem no silêncio junto com o
 * resto do não classificado.
 *
 * Aqui elas ganham um grupo próprio, que também não entra em conta nenhuma —
 * mas aparece nomeado. A diferença é que "excluído de propósito" e "ninguém
 * classificou" param de ser a mesma coisa na tela.
 */
export const TRANSFERENCIA = "transferencia";

// ─── As linhas do relatório ─────────────────────────────────────────────────

export type LinhaDoDre =
  /** O total de um grupo. */
  | { code: string; label: string; tipo: "grupo"; grupo: string }
  /** Soma de outras linhas. Os sinais já vêm do dado — ver o cabeçalho de `calculo.ts`. */
  | { code: string; label: string; tipo: "subtotal"; parcelas: string[]; destaque?: boolean }
  /**
   * Um percentual sobre outra linha.
   *
   * `absoluto` reproduz a planilha, que escreve `((x/y)^2)^(1/2)` — que é
   * `ABS` — nas linhas de despesa, e divisão simples nas de resultado. O efeito
   * é que despesa aparece como "24%" e não "−24%", e resultado negativo
   * aparece com o sinal. Mantido por fidelidade.
   */
  | { code: string; label: string; tipo: "percentual"; numerador: string; denominador: string; absoluto: boolean };

const PCT = (code: string, label: string, numerador: string, denominador: string, absoluto: boolean): LinhaDoDre => ({
  code,
  label,
  tipo: "percentual",
  numerador,
  denominador,
  absoluto,
});

/**
 * O relatório, na ordem em que é lido.
 *
 * Conferido linha a linha contra `DRE FINANCEIRO 2025`, incluindo quais
 * parcelas entram em cada subtotal. Duas coisas que a conferência revelou, e
 * que estão reproduzidas aqui de propósito:
 *
 * 1. **`RECEITA LÍQUIDA` é calculada e não é usada em nenhum resultado.** A
 *    margem de contribuição parte da Receita **Bruta**. Ver `OPCOES_PADRAO`.
 * 2. **O % de mão de obra divide pela Receita Líquida**, enquanto os outros
 *    quatorze dividem pela Bruta — apesar de o rótulo dizer "sobre receita
 *    bruta". Está como na planilha, e marcado aqui para não parecer descuido.
 */
export const LINHAS: LinhaDoDre[] = [
  { code: "receita_bruta", label: "RECEITA BRUTA", tipo: "grupo", grupo: "receita_bruta", },
  { code: "impostos", label: "IMPOSTOS SOBRE RECEITA BRUTA", tipo: "grupo", grupo: "impostos" },
  PCT("impostos_pct", "Impostos sobre Receita Bruta %", "impostos", "receita_bruta", true),
  { code: "receita_liquida", label: "RECEITA LÍQUIDA", tipo: "subtotal", parcelas: ["receita_bruta", "impostos"] },

  { code: "cmv", label: "CMV SOBRE RECEITA BRUTA", tipo: "grupo", grupo: "cmv" },
  PCT("cmv_pct", "CMV sobre Receita Bruta %", "cmv", "receita_bruta", true),

  { code: "mao_de_obra", label: "MÃO DE OBRA SOBRE RECEITA BRUTA", tipo: "grupo", grupo: "mao_de_obra" },
  // O denominador é a LÍQUIDA. Está assim na planilha; o rótulo diz bruta.
  PCT("mao_de_obra_pct", "Mão de Obra sobre Receita Bruta %", "mao_de_obra", "receita_liquida", true),

  { code: "comerciais", label: "DESPESAS FIXAS (COMERCIAIS)", tipo: "grupo", grupo: "comerciais" },
  PCT("comerciais_pct", "Despesas Fixas (Comerciais) sobre Receita Bruta %", "comerciais", "receita_bruta", false),

  {
    code: "margem_contribuicao",
    label: "MARGEM DE CONTRIBUIÇÃO",
    tipo: "subtotal",
    parcelas: ["receita_bruta", "cmv", "mao_de_obra", "comerciais"],
    destaque: true,
  },
  PCT("margem_contribuicao_pct", "Margem de Contribuição sobre Receita Bruta %", "margem_contribuicao", "receita_bruta", false),

  { code: "pessoal", label: "DESPESAS FIXAS (PESSOAL)", tipo: "grupo", grupo: "pessoal" },
  PCT("pessoal_pct", "Despesas Fixas (Pessoal) sobre Receita Bruta %", "pessoal", "receita_bruta", false),
  { code: "diretoria", label: "DESPESAS FIXAS (DIRETORIA)", tipo: "grupo", grupo: "diretoria" },
  PCT("diretoria_pct", "Despesas Fixas (Diretoria) sobre Receita Bruta %", "diretoria", "receita_bruta", true),
  { code: "administrativas", label: "DESPESAS FIXAS (ADMINISTRATIVAS)", tipo: "grupo", grupo: "administrativas" },
  PCT("administrativas_pct", "Despesas Fixas (Administrativas) sobre Receita Bruta %", "administrativas", "receita_bruta", true),
  { code: "financeiras", label: "DESPESAS FIXAS (FINANCEIRAS)", tipo: "grupo", grupo: "financeiras" },
  PCT("financeiras_pct", "Despesas Fixas (Financeiras) sobre Receita Bruta %", "financeiras", "receita_bruta", false),

  {
    code: "total_despesas_fixas",
    label: "TOTAL DE DESPESAS FIXAS",
    tipo: "subtotal",
    parcelas: ["pessoal", "diretoria", "administrativas", "financeiras"],
  },
  PCT("total_despesas_fixas_pct", "Total de Despesas Fixas sobre Receita Bruta %", "total_despesas_fixas", "receita_bruta", true),

  {
    code: "gerador_de_caixa",
    label: "GERADOR DE CAIXA OPERACIONAL",
    tipo: "subtotal",
    parcelas: ["margem_contribuicao", "total_despesas_fixas"],
    destaque: true,
  },
  PCT("gerador_de_caixa_pct", "Gerador de Caixa Operacional sobre Receita Bruta %", "gerador_de_caixa", "receita_bruta", false),

  { code: "investimentos", label: "INVESTIMENTOS TOTAIS", tipo: "grupo", grupo: "investimentos" },
  PCT("investimentos_pct", "Investimentos sobre Receita Bruta %", "investimentos", "receita_bruta", false),

  {
    code: "fluxo_apos_investimentos",
    label: "FLUXO DE CAIXA APÓS INVESTIMENTOS",
    tipo: "subtotal",
    parcelas: ["gerador_de_caixa", "investimentos"],
  },
  PCT("fluxo_apos_investimentos_pct", "Fluxo de Caixa após Investimentos sobre Receita Bruta %", "fluxo_apos_investimentos", "receita_bruta", false),

  { code: "outras_receitas", label: "OUTRAS RECEITAS TOTAIS", tipo: "grupo", grupo: "outras_receitas" },
  PCT("outras_receitas_pct", "Outras Receitas sobre Receita Bruta %", "outras_receitas", "receita_bruta", false),
  { code: "outras_despesas", label: "OUTRAS DESPESAS TOTAIS (RECEITAS E DESPESAS NÃO OPERACIONAIS)", tipo: "grupo", grupo: "outras_despesas" },
  PCT("outras_despesas_pct", "Outras Despesas sobre Receita Bruta %", "outras_despesas", "receita_bruta", true),

  {
    code: "fluxo_de_caixa_livre",
    label: "FLUXO DE CAIXA LIVRE",
    tipo: "subtotal",
    parcelas: ["fluxo_apos_investimentos", "outras_receitas", "outras_despesas"],
    destaque: true,
  },
  PCT("fluxo_de_caixa_livre_pct", "Fluxo de Caixa Livre sobre Receita Bruta %", "fluxo_de_caixa_livre", "receita_bruta", false),
];

export function linhaPorCodigo(code: string): LinhaDoDre | null {
  return LINHAS.find((l) => l.code === code) ?? null;
}

export type OpcoesDoDre = {
  /**
   * A margem de contribuição parte da Receita **Líquida** em vez da Bruta?
   *
   * ─── CHUTE, 11/09 — reversível num campo ────────────────────────────────
   *
   * `false` reproduz a planilha, e é o padrão: o número que o Connect mostra
   * fica igual ao que o BPO entrega hoje, o que é o único jeito de conferir a
   * migração contra um mês real.
   *
   * Mas o efeito de `false` é que **os impostos sobre receita não entram no
   * resultado**. Em outubro/2025 foram R$ 46.148,78 que saíram do caixa e não
   * aparecem no Fluxo de Caixa Livre; no acumulado do ano até outubro, R$
   * 191.536,87. Confere em todos os dez meses: a diferença entre somar todos os
   * grupos e o fluxo livre é exatamente o imposto, e nos meses sem imposto pago
   * os dois números batem.
   *
   * Pode ser intencional — há modelo gerencial que isola a carga tributária.
   * Enquanto o BPO não confirma, a tela avisa em vez de escolher em silêncio.
   */
  margemPartirDaLiquida: boolean;
};

export const OPCOES_PADRAO: OpcoesDoDre = { margemPartirDaLiquida: false };

/** As parcelas da margem, conforme a opção. */
export function parcelasDaMargem(opcoes: OpcoesDoDre): string[] {
  const base = opcoes.margemPartirDaLiquida ? "receita_liquida" : "receita_bruta";
  return [base, "cmv", "mao_de_obra", "comerciais"];
}
