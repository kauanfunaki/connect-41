// O modelo "despesas por área" — customizado (21/10/2026).
//
// É o que foi o padrão do Connect até 20/10/2026, lido linha a linha da
// planilha que o BPO entregava (`DRE FINANCEIRO 2025`, conferida em
// 11/09/2026): doze grupos, as despesas fixas abertas por área, os
// investimentos à parte e o fluxo de caixa livre no fim. Quando o padrão virou
// o modelo novo (20/10/2026), a empresa que usava este perdeu a visão que tinha;
// ele volta aqui como modelo customizado, escolhido por empresa
// (`Company.dreModelo`), idêntico ao de antes — conta, rótulo e percentual.
//
// Duas coisas da planilha, reproduzidas de propósito:
//
// 1. **A margem de contribuição parte da Receita Bruta** e os impostos não
//    entram em resultado nenhum (`impostos: "fora"`) — a tela diz quanto ficou
//    de fora.
// 2. **O % de mão de obra divide pela Receita Líquida**, enquanto os outros
//    dividem pela Bruta — apesar de o rótulo dizer "sobre receita bruta".

import type { GrupoDoDre, LinhaDoDre, ModeloDoDre } from "./estrutura";

export const GRUPOS_POR_AREA: GrupoDoDre[] = [
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

const PCT = (code: string, label: string, numerador: string, denominador: string, absoluto: boolean): LinhaDoDre => ({
  code,
  label,
  tipo: "percentual",
  numerador,
  denominador,
  absoluto,
});

export const LINHAS_POR_AREA: LinhaDoDre[] = [
  { code: "receita_bruta", label: "RECEITA BRUTA", tipo: "grupo", grupo: "receita_bruta" },
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
  PCT(
    "fluxo_apos_investimentos_pct",
    "Fluxo de Caixa após Investimentos sobre Receita Bruta %",
    "fluxo_apos_investimentos",
    "receita_bruta",
    false
  ),

  { code: "outras_receitas", label: "OUTRAS RECEITAS TOTAIS", tipo: "grupo", grupo: "outras_receitas" },
  PCT("outras_receitas_pct", "Outras Receitas sobre Receita Bruta %", "outras_receitas", "receita_bruta", false),
  {
    code: "outras_despesas",
    label: "OUTRAS DESPESAS TOTAIS (RECEITAS E DESPESAS NÃO OPERACIONAIS)",
    tipo: "grupo",
    grupo: "outras_despesas",
  },
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

export const MODELO_POR_AREA: ModeloDoDre = {
  codigo: "por_area",
  nome: "Customizado: despesas por área",
  descricao:
    "O padrão até 20/10/2026: CMV, mão de obra e despesas fixas por área (comerciais, pessoal, diretoria, administrativas, financeiras), investimentos à parte, gerador de caixa e fluxo de caixa livre. Os impostos ficam fora do resultado.",
  grupos: GRUPOS_POR_AREA,
  linhas: LINHAS_POR_AREA,
  linhaOperacional: "gerador_de_caixa",
  linhaDoResultado: "fluxo_de_caixa_livre",
  impostos: "fora",
  rotulosEconomicos: {
    gerador_de_caixa: "RESULTADO OPERACIONAL",
    gerador_de_caixa_pct: "Resultado Operacional sobre Receita Bruta %",
    fluxo_apos_investimentos: "RESULTADO APÓS INVESTIMENTOS",
    fluxo_apos_investimentos_pct: "Resultado após Investimentos sobre Receita Bruta %",
    fluxo_de_caixa_livre: "RESULTADO DO PERÍODO",
    fluxo_de_caixa_livre_pct: "Resultado do Período sobre Receita Bruta %",
  },
  numeros: {
    caixa: ["Gerador de caixa operacional", "Fluxo de caixa livre"],
    competencia: ["Resultado operacional", "Resultado do período"],
  },
  analises: {
    comparativo: [
      "receita_bruta",
      "impostos",
      "cmv",
      "mao_de_obra",
      "comerciais",
      "margem_contribuicao",
      "pessoal",
      "diretoria",
      "administrativas",
      "financeiras",
      "total_despesas_fixas",
      "gerador_de_caixa",
      "investimentos",
      "outras_receitas",
      "outras_despesas",
      "fluxo_de_caixa_livre",
    ],
    principais: [
      "receita_bruta",
      "cmv",
      "mao_de_obra",
      "comerciais",
      "margem_contribuicao",
      "total_despesas_fixas",
      "gerador_de_caixa",
      "investimentos",
      "fluxo_de_caixa_livre",
    ],
    estrutura: ["total_despesas_fixas"],
    formulaDaEstrutura: "|Total de despesas fixas| / Receita bruta",
    leituraDoOperacional: "O resultado da operação antes de investimentos e não operacionais.",
    foraDoOperacional: ["investimentos", "outras_despesas"],
  },
  simulador: {
    linhas: ["receita_bruta", "margem_contribuicao", "total_despesas_fixas", "gerador_de_caixa", "fluxo_de_caixa_livre"],
    dicaDaReceita: "Impostos, CMV, mão de obra e comerciais acompanham.",
    variaveis: ["impostos", "cmv", "mao_de_obra", "comerciais"],
    campos: [
      { chave: "custoOperacional", rotulo: "CMV além da receita", dica: "Custo que sobe mais (ou menos) que a venda.", grupos: ["cmv"] },
      {
        chave: "custoAdministrativo",
        rotulo: "Despesas fixas",
        dica: "Pessoal, diretoria e administrativas.",
        grupos: ["pessoal", "diretoria", "administrativas"],
      },
      { chave: "financiamentos", rotulo: "Despesas financeiras", dica: "Juros e tarifas.", grupos: ["financeiras"] },
    ],
  },
  subtotaisDoOrcamento: [
    "receita_liquida",
    "margem_contribuicao",
    "total_despesas_fixas",
    "gerador_de_caixa",
    "fluxo_apos_investimentos",
    "fluxo_de_caixa_livre",
  ],
};
