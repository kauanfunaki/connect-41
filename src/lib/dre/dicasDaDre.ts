// O que é cada linha da DRE, numa frase para quem não é contador (11/11/2026,
// P16 do polimento do portal). Vira a dica (`data-dica`) dos números do topo e
// dos nomes de linha da DRE do cliente: "Margem de contribuição", "CMV",
// "EBITDA" não diziam nada ao dono da empresa.
//
// Pelo código da linha, que é o mesmo nos dois regimes (a de competência só
// troca o nome, `rotuloEconomico`) e nos modelos (o padrão e o "por área").
// A linha de percentual (`…_pct`) usa a frase da linha dela.

const DICAS: Record<string, string> = {
  receita_bruta: "Tudo o que a empresa vendeu, antes de tirar impostos e custos.",
  impostos: "Os impostos cobrados sobre as vendas.",
  receita_liquida: "As vendas menos os impostos sobre elas.",
  cmv: "CMV é o custo da mercadoria vendida: quanto custou o que a empresa vendeu.",
  mao_de_obra: "O custo de quem produz o que a empresa vende ou presta o serviço.",
  custo_operacional: "Os custos que sobem e descem com as vendas, como mercadoria, matéria-prima e comissões.",
  comerciais: "Despesas para vender: comissões, propaganda, fretes.",
  margem_contribuicao:
    "O que sobra das vendas depois dos custos que acompanham cada venda. É com ela que a empresa paga as despesas fixas.",
  custo_administrativo: "As despesas fixas do dia a dia, como aluguel, salários do escritório, contador e sistemas.",
  pessoal: "Salários, encargos e benefícios da equipe.",
  diretoria: "Retirada e despesas dos sócios e da diretoria.",
  administrativas: "Aluguel, contas de consumo, contador, sistemas e outras despesas do escritório.",
  financeiras: "Juros, tarifas e outras despesas com bancos.",
  total_despesas_fixas: "A soma das despesas que a empresa tem todo mês, vendendo ou não.",
  financiamentos: "Parcelas de empréstimos, financiamentos e impostos parcelados.",
  ebitda:
    "EBITDA, ou gerador de caixa: o que a operação da empresa deu de resultado, antes de investimentos e do que é fora da operação.",
  gerador_de_caixa: "O que a operação da empresa deu de resultado, antes de investimentos e do que é fora da operação.",
  investimentos: "O que foi gasto para a empresa crescer, como máquinas, reformas e equipamentos.",
  fluxo_apos_investimentos: "O gerador de caixa menos os investimentos.",
  outras_receitas: "Entradas que não vêm das vendas, como rendimentos e reembolsos.",
  outras_despesas: "Saídas fora da operação do dia a dia.",
  resultado_liquido: "O que sobrou no fim, depois de todos os custos e despesas.",
  fluxo_de_caixa_livre: "O que sobrou no fim, depois de tudo, inclusive dos investimentos.",
};

/** A frase da linha, ou `undefined` quando a linha não precisa de explicação. */
export function dicaDaLinha(code: string): string | undefined {
  if (code.endsWith("_pct")) {
    const base = DICAS[code.slice(0, -4)];
    return base ? `${base} Aqui, em porcentagem das vendas.` : undefined;
  }
  return DICAS[code];
}
