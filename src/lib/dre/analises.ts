// As análises gerenciais sobre a DRE: reconciliação lucro → caixa,
// comparativos, forecast, cenários e indicadores. Funções puras, sem banco.
//
// ─── Tudo parte da mesma estrutura ───────────────────────────────────────────
//
// Nenhuma análise tem DRE própria. Todas recebem `porGrupo` ou
// `ResultadoDoDre` montados por `calcularDre`/`montarLinhas`, e pedem as linhas
// pelo código de `estrutura.ts`. É o que garante que "resultado operacional"
// no forecast seja o mesmo número da DRE econômica do mesmo mês.
//
// ─── Centavos, sempre ────────────────────────────────────────────────────────
//
// Projeção e cenário multiplicam por fração, e o resultado é arredondado para
// centavo **na hora**, grupo a grupo. Arredondar só no fim deixaria subtotal e
// soma das parcelas diferirem por um centavo — o tipo de diferença que faz
// alguém refazer a conta à mão e perder a confiança no resto.

import { calcularDre, montarLinhas, type LancamentoDoDre, type Mapeamento, type ResultadoDoDre } from "./calculo";
import { GRUPOS, NAO_CLASSIFICADO, TRANSFERENCIA, OPCOES_PADRAO, type OpcoesDoDre } from "./estrutura";
import { LINHA_DE_RESULTADO, LINHA_OPERACIONAL, valorDaLinha } from "./economica";
import { runwayEmDias } from "@/lib/financeiro/conciliacao/saldoConsolidado";

// ─── Reconciliação lucro → caixa ────────────────────────────────────────────

export type PassoDaReconciliacao = {
  code: string;
  label: string;
  centavos: number;
  tipo: "total" | "ajuste";
};

export type ConjuntosDaReconciliacao = {
  /** Competência do mês **e** liquidado no mês. */
  ambos: LancamentoDoDre[];
  /** Competência do mês, não liquidado no mês (em aberto ou liquidado noutro mês). */
  soCompetencia: LancamentoDoDre[];
  /** Liquidado no mês, de outra competência. */
  soCaixa: LancamentoDoDre[];
};

function resultadoDe(l: LancamentoDoDre[], m: Mapeamento, o: OpcoesDoDre): number {
  return valorDaLinha(calcularDre(l, m, o), LINHA_DE_RESULTADO);
}

/**
 * A ponte do resultado econômico até a variação de caixa do mesmo mês.
 *
 * ─── Por que fecha no centavo, sem resíduo ────────────────────────────────
 *
 * O protótipo fechava a ponte com um "ajuste de timing" que era o resíduo. Aqui
 * não precisa: o resultado da estrutura da 41 é **soma** de grupos, então é
 * linear no conjunto de lançamentos. Separando os lançamentos em três conjuntos
 * disjuntos — competência e caixa no mês, só competência, só caixa —:
 *
 *     econômico = R(ambos) + R(soCompetencia)
 *     caixa     = R(ambos) + R(soCaixa)
 *     caixa     = econômico − R(soCompetencia) + R(soCaixa)
 *
 * Cada passo é um número que se consegue abrir em lançamentos. O último passo
 * leva do resultado de caixa à variação de caixa: o que andou e não é resultado
 * (transferência, não classificado e, pela opção padrão, o imposto sobre
 * receita que fica fora da margem).
 */
export function reconciliarLucroCaixa(
  c: ConjuntosDaReconciliacao,
  mapeamento: Mapeamento,
  opcoes: OpcoesDoDre = OPCOES_PADRAO
): PassoDaReconciliacao[] {
  const R = (l: LancamentoDoDre[]) => resultadoDe(l, mapeamento, opcoes);
  const receitas = (l: LancamentoDoDre[]) => l.filter((x) => x.origem === "recebimento");
  const despesas = (l: LancamentoDoDre[]) => l.filter((x) => x.origem === "pagamento");

  const economico = R([...c.ambos, ...c.soCompetencia]);
  const caixa = R([...c.ambos, ...c.soCaixa]);
  const variacao = [...c.ambos, ...c.soCaixa].reduce((n, l) => n + l.valorCentavos, 0);

  return [
    { code: "resultado_economico", label: "Resultado do período (competência)", centavos: economico, tipo: "total" },
    {
      code: "receitas_nao_recebidas",
      label: "(−) Receitas do mês ainda não recebidas no mês",
      centavos: -R(receitas(c.soCompetencia)),
      tipo: "ajuste",
    },
    {
      code: "despesas_nao_pagas",
      label: "(+) Despesas do mês ainda não pagas no mês",
      centavos: -R(despesas(c.soCompetencia)),
      tipo: "ajuste",
    },
    {
      code: "recebimentos_de_outros_meses",
      label: "(+) Recebido no mês, de outras competências",
      centavos: R(receitas(c.soCaixa)),
      tipo: "ajuste",
    },
    {
      code: "pagamentos_de_outros_meses",
      label: "(−) Pago no mês, de outras competências",
      centavos: R(despesas(c.soCaixa)),
      tipo: "ajuste",
    },
    { code: "resultado_caixa", label: "Resultado de caixa (lançamentos do Connect)", centavos: caixa, tipo: "total" },
    {
      code: "fora_do_resultado",
      label: "(±) Caixa fora do resultado — transferências, não classificado e impostos fora da margem",
      centavos: variacao - caixa,
      tipo: "ajuste",
    },
    { code: "variacao_de_caixa", label: "Variação líquida de caixa do mês", centavos: variacao, tipo: "total" },
  ];
}

// ─── Comparativos ───────────────────────────────────────────────────────────

export type LinhaComparada = {
  code: string;
  label: string;
  atual: number;
  comparado: number;
  diferenca: number;
  /** Variação sobre o comparado, em fração. `null` quando o comparado é zero. */
  variacao: number | null;
};

/** Linhas de valor (grupos e subtotais) que valem comparar — percentual não se compara por diferença. */
export const LINHAS_DO_COMPARATIVO = [
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
];

/**
 * Duas DREs lado a lado, linha a linha.
 *
 * A variação divide pelo **valor absoluto** do comparado: despesa que vai de
 * −100 para −150 cresceu 50%, e dividir pelo negativo diria que caiu.
 */
export function compararResultados(
  atual: ResultadoDoDre,
  comparado: ResultadoDoDre,
  codigos: string[] = LINHAS_DO_COMPARATIVO,
  rotulo: (code: string, original: string) => string = (_, o) => o
): LinhaComparada[] {
  return codigos.map((code) => {
    const linha = atual.linhas.find((l) => l.code === code);
    const a = valorDaLinha(atual, code);
    const b = valorDaLinha(comparado, code);
    return {
      code,
      label: rotulo(code, linha?.label ?? code),
      atual: a,
      comparado: b,
      diferenca: a - b,
      variacao: b === 0 ? null : (a - b) / Math.abs(b),
    };
  });
}

/** Soma resultados de vários meses num só — o acumulado. */
export function somarPorGrupo(lista: Record<string, number>[]): Record<string, number> {
  const total: Record<string, number> = { [NAO_CLASSIFICADO]: 0, [TRANSFERENCIA]: 0 };
  for (const g of GRUPOS) total[g.code] = 0;
  for (const p of lista) for (const [k, v] of Object.entries(p)) total[k] = (total[k] ?? 0) + v;
  return total;
}

/** Um `ResultadoDoDre` a partir de totais por grupo já agregados. */
export function resultadoDePorGrupo(porGrupo: Record<string, number>, opcoes: OpcoesDoDre = OPCOES_PADRAO): ResultadoDoDre {
  return { linhas: montarLinhas(porGrupo, opcoes), porGrupo, naoClassificado: [], diferencaDeFechamento: 0 };
}

// ─── Atraso médio de liquidação ─────────────────────────────────────────────

/**
 * Média de dias entre vencimento e liquidação. Positivo é atraso.
 *
 * Média **simples**, não ponderada por valor: a pergunta é "costumamos pagar em
 * dia?", e uma conta grande paga em dia não apaga dez pequenas atrasadas.
 */
export function atrasoMedioEmDias(pares: { vencimentoKey: string; liquidadoKey: string }[]): number | null {
  if (pares.length === 0) return null;
  let soma = 0;
  for (const p of pares) {
    const [a, b] = [p.vencimentoKey, p.liquidadoKey].map((k) => {
      const [y, m, d] = k.split("-").map(Number);
      return Date.UTC(y!, m! - 1, d!);
    });
    soma += Math.round((b! - a!) / 86_400_000);
  }
  return soma / pares.length;
}

// ─── Forecast ───────────────────────────────────────────────────────────────

export type MetodoDeProjecao = "media_movel" | "tendencia" | "sazonalidade";

export const METODOS_DE_PROJECAO: { chave: MetodoDeProjecao; rotulo: string }[] = [
  { chave: "tendencia", rotulo: "Tendência linear" },
  { chave: "media_movel", rotulo: "Média móvel (3 meses)" },
  { chave: "sazonalidade", rotulo: "Sazonalidade" },
];

function regressaoLinear(valores: number[]): { inclinacao: number; intercepto: number } {
  const n = valores.length;
  const xMedio = (n - 1) / 2;
  const yMedio = valores.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMedio) * (valores[i]! - yMedio);
    den += (i - xMedio) ** 2;
  }
  const inclinacao = den === 0 ? 0 : num / den;
  return { inclinacao, intercepto: yMedio - inclinacao * xMedio };
}

/**
 * Projeta uma série mensal em centavos.
 *
 * Determinístico, sem IA: três métodos que se explicam em uma frase cada.
 *
 * - **média móvel** — o próximo mês é a média dos três anteriores, e a janela
 *   anda levando a própria projeção;
 * - **tendência** — regressão linear sobre o histórico, estendida;
 * - **sazonalidade** — a tendência multiplicada pelo peso do mesmo mês do
 *   calendário no histórico. Com doze meses de amostra o peso é de **um** ano
 *   só, e a tela avisa.
 *
 * `mesesDoHistorico` e `mesesProjetados` são os meses do calendário (1–12) de
 * cada posição — só a sazonalidade usa.
 */
export function projetarSerie(
  historico: number[],
  metodo: MetodoDeProjecao,
  horizonte: number,
  mesesDoHistorico: number[] = [],
  mesesProjetados: number[] = []
): number[] {
  if (historico.length === 0) return Array.from({ length: horizonte }, () => 0);

  if (metodo === "media_movel") {
    const janela = [...historico];
    const saida: number[] = [];
    for (let i = 0; i < horizonte; i++) {
      const ultimos = janela.slice(-3);
      const proximo = Math.round(ultimos.reduce((a, b) => a + b, 0) / ultimos.length);
      saida.push(proximo);
      janela.push(proximo);
    }
    return saida;
  }

  const { inclinacao, intercepto } = regressaoLinear(historico);
  const tendencia = (i: number) => intercepto + inclinacao * (historico.length + i);

  if (metodo === "tendencia") {
    return Array.from({ length: horizonte }, (_, i) => Math.round(tendencia(i)));
  }

  const media = historico.reduce((a, b) => a + b, 0) / historico.length;
  return Array.from({ length: horizonte }, (_, i) => {
    const mes = mesesProjetados[i];
    const idx = mes === undefined ? -1 : mesesDoHistorico.lastIndexOf(mes);
    // Média zero não tem peso a distribuir; mês sem par no histórico, idem.
    const peso = media === 0 || idx < 0 ? 1 : historico[idx]! / media;
    return Math.round(tendencia(i) * peso);
  });
}

// ─── Cenários ───────────────────────────────────────────────────────────────

export type PremissasDoCenario = {
  /** Variação da receita bruta, em %. Impostos, CMV, mão de obra e comerciais acompanham. */
  receita: number;
  /** Variação do CMV **além** do que já acompanha a receita, em %. */
  cmv: number;
  /** Variação das despesas fixas de pessoal, diretoria e administrativas, em %. */
  despesasFixas: number;
  /** Variação das despesas financeiras, em %. */
  financeiras: number;
};

export const PREMISSAS_ZERADAS: PremissasDoCenario = { receita: 0, cmv: 0, despesasFixas: 0, financeiras: 0 };

export const CENARIOS_PRONTOS: { chave: string; rotulo: string; premissas: PremissasDoCenario }[] = [
  { chave: "pessimista", rotulo: "Pessimista", premissas: { receita: -10, cmv: 5, despesasFixas: 3, financeiras: 10 } },
  { chave: "base", rotulo: "Base", premissas: PREMISSAS_ZERADAS },
  { chave: "otimista", rotulo: "Otimista", premissas: { receita: 10, cmv: -3, despesasFixas: 0, financeiras: -5 } },
];

/** Grupos que andam junto com a receita — o variável da estrutura da 41. */
const VARIAVEIS = ["impostos", "cmv", "mao_de_obra", "comerciais"];
const FIXAS = ["pessoal", "diretoria", "administrativas"];

/**
 * Aplica as premissas aos totais por grupo de um mês real.
 *
 * O variável é o que está **dentro da margem de contribuição** na estrutura da
 * 41 — impostos, CMV, mão de obra e comerciais — e escala com a receita. As
 * despesas fixas só mudam pela premissa delas. Investimentos, outras receitas e
 * outras despesas ficam constantes: não há premissa honesta para eles a partir
 * de um mês só.
 */
export function simularCenario(porGrupo: Record<string, number>, p: PremissasDoCenario): Record<string, number> {
  const fator = (pct: number) => 1 + pct / 100;
  const r = fator(p.receita);
  const saida: Record<string, number> = { ...porGrupo };
  // Só grupo que existe na entrada é tocado: criar chave zerada mudaria o
  // formato do `porGrupo` sem mudar número nenhum.
  const aplicar = (g: string, multiplicador: number) => {
    if (g in porGrupo) saida[g] = Math.round(porGrupo[g]! * multiplicador);
  };
  aplicar("receita_bruta", r);
  for (const g of VARIAVEIS) aplicar(g, r * (g === "cmv" ? fator(p.cmv) : 1));
  for (const g of FIXAS) aplicar(g, fator(p.despesasFixas));
  aplicar("financeiras", fator(p.financeiras));
  return saida;
}

// ─── Indicadores ────────────────────────────────────────────────────────────

export type FormatoDoIndicador = "moeda" | "percentual" | "dias";
export type CategoriaDoIndicador = "Rentabilidade" | "Capital de giro" | "Caixa" | "Risco";

export type Indicador = {
  codigo: string;
  categoria: CategoriaDoIndicador;
  rotulo: string;
  formula: string;
  leitura: string;
  formato: FormatoDoIndicador;
  /** Centavos em `moeda`, fração em `percentual`, dias em `dias`. */
  valor: number | null;
  /** Por que não há valor. Presente só quando `valor` é `null`. */
  motivo?: string;
};

export type DadosDosIndicadores = {
  economico: ResultadoDoDre;
  /** Dias da competência — base do PMR e do PMP. */
  diasNoMes: number;
  aReceberEmAberto: number;
  aReceberVencido: number;
  aPagarEmAberto: number;
  /** Variação líquida de caixa dos últimos meses, do mais antigo ao mais novo. */
  variacoesDeCaixa: number[];
  /** Maior contraparte do a receber em aberto, em centavos. */
  maiorClienteEmAberto: number;
  /**
   * Saldo das contas bancárias da empresa, vindo da conciliação. Ausente ou
   * `null` = sem conta com saldo, e o runway diz isso em vez de ser estimado.
   */
  saldoBancario?: { centavos: number; atualizadoAteKey: string | null } | null;
};

/**
 * A central de indicadores, calculada.
 *
 * Indicador que depende de dado que o Connect não tem — balanço, estoque,
 * saldo bancário — **aparece sem valor e com o motivo**, em vez de sumir ou de
 * ser estimado. Some da tela é o jeito de alguém achar que foi esquecido; ser
 * estimado é o jeito de alguém decidir em cima dele.
 */
/**
 * Runway: quantos dias o saldo das contas sustenta o consumo médio de caixa dos
 * últimos três meses. Os três "não há valor" têm motivos diferentes, e cada um
 * pede uma ação diferente de quem lê.
 */
function indicadorDeRunway(
  saldo: { centavos: number; atualizadoAteKey: string | null } | null,
  mediaRecente: number | null
): Indicador {
  const base = {
    codigo: "runway",
    categoria: "Caixa" as const,
    rotulo: "Runway",
    formula: "Saldo bancário / Consumo médio de caixa (3 meses)",
    leitura: "Quantos dias o saldo das contas sustenta o ritmo atual de consumo.",
    formato: "dias" as const,
  };
  if (!saldo) {
    return {
      ...base,
      valor: null,
      motivo: "Sem saldo bancário desta empresa: cadastre a conta e importe o extrato em Conciliação bancária.",
    };
  }
  if (mediaRecente === null) return { ...base, valor: null, motivo: "Sem movimento de caixa nos últimos meses." };
  const dias = runwayEmDias(saldo.centavos, mediaRecente);
  if (dias === null) {
    return { ...base, valor: null, motivo: "Não se aplica: nos últimos três meses entrou mais caixa do que saiu." };
  }
  return { ...base, valor: dias };
}

export function calcularIndicadores(d: DadosDosIndicadores): Indicador[] {
  const receita = valorDaLinha(d.economico, "receita_bruta");
  const despesasDoMes = GRUPOS.filter((g) => g.origem === "pagamento").reduce(
    (n, g) => n + Math.abs(d.economico.porGrupo[g.code] ?? 0),
    0
  );
  const fracao = (num: number, den: number) => (den === 0 ? null : num / den);
  const semReceita = "Sem receita reconhecida na competência.";

  const pmr = receita > 0 ? (d.aReceberEmAberto / receita) * d.diasNoMes : null;
  const pmp = despesasDoMes > 0 ? (d.aPagarEmAberto / despesasDoMes) * d.diasNoMes : null;

  const ultimos = d.variacoesDeCaixa.slice(-3);
  const mediaRecente = ultimos.length === 0 ? null : Math.round(ultimos.reduce((a, b) => a + b, 0) / ultimos.length);

  const comMotivo = (i: Indicador, motivo: string): Indicador => (i.valor === null ? { ...i, motivo } : i);

  return [
    comMotivo(
      {
        codigo: "margem_contribuicao",
        categoria: "Rentabilidade",
        rotulo: "Margem de contribuição",
        formula: "Margem de contribuição / Receita bruta",
        leitura: "Quanto sobra da receita depois do que varia com ela.",
        formato: "percentual",
        valor: fracao(valorDaLinha(d.economico, "margem_contribuicao"), receita),
      },
      semReceita
    ),
    comMotivo(
      {
        codigo: "margem_operacional",
        categoria: "Rentabilidade",
        rotulo: "Margem operacional",
        formula: "Resultado operacional / Receita bruta",
        leitura: "O resultado da operação antes de investimentos e não operacionais.",
        formato: "percentual",
        valor: fracao(valorDaLinha(d.economico, LINHA_OPERACIONAL), receita),
      },
      semReceita
    ),
    comMotivo(
      {
        codigo: "margem_liquida",
        categoria: "Rentabilidade",
        rotulo: "Margem do período",
        formula: "Resultado do período / Receita bruta",
        leitura: "Quanto da receita virou resultado no fim da estrutura.",
        formato: "percentual",
        valor: fracao(valorDaLinha(d.economico, LINHA_DE_RESULTADO), receita),
      },
      semReceita
    ),
    comMotivo(
      {
        codigo: "peso_despesas_fixas",
        categoria: "Rentabilidade",
        rotulo: "Peso das despesas fixas",
        formula: "|Total de despesas fixas| / Receita bruta",
        leitura: "Quanto da receita o custo de estrutura consome.",
        formato: "percentual",
        valor: fracao(Math.abs(valorDaLinha(d.economico, "total_despesas_fixas")), receita),
      },
      semReceita
    ),
    comMotivo(
      {
        codigo: "pmr",
        categoria: "Capital de giro",
        rotulo: "PMR — prazo médio de recebimento",
        formula: "(A receber em aberto / Receita bruta) × dias do mês",
        leitura: "Em quantos dias, em média, a venda vira dinheiro.",
        formato: "dias",
        valor: pmr,
      },
      semReceita
    ),
    comMotivo(
      {
        codigo: "pmp",
        categoria: "Capital de giro",
        rotulo: "PMP — prazo médio de pagamento",
        formula: "(A pagar em aberto / Despesas da competência) × dias do mês",
        leitura: "Em quantos dias, em média, a empresa paga o que deve.",
        formato: "dias",
        valor: pmp,
      },
      "Sem despesa reconhecida na competência."
    ),
    {
      codigo: "ncg",
      categoria: "Capital de giro",
      rotulo: "Necessidade de capital de giro",
      formula: "A receber em aberto − A pagar em aberto",
      leitura: "Quanto a operação tem de financiar enquanto espera receber.",
      formato: "moeda",
      valor: d.aReceberEmAberto - d.aPagarEmAberto,
    },
    comMotivo(
      {
        codigo: "ciclo_financeiro",
        categoria: "Capital de giro",
        rotulo: "Ciclo financeiro (sem estoque)",
        formula: "PMR − PMP",
        leitura: "Dias que a empresa financia sozinha. O Connect não controla estoque, então o PME fica de fora.",
        formato: "dias",
        valor: pmr !== null && pmp !== null ? pmr - pmp : null,
      },
      "Depende do PMR e do PMP."
    ),
    comMotivo(
      {
        codigo: "variacao_media_caixa",
        categoria: "Caixa",
        rotulo: "Variação média de caixa (3 meses)",
        formula: "Média de (recebido − pago) dos últimos três meses",
        leitura: "Negativo é consumo de caixa — o burn rate.",
        formato: "moeda",
        valor: mediaRecente,
      },
      "Sem movimento de caixa nos últimos meses."
    ),
    indicadorDeRunway(d.saldoBancario ?? null, mediaRecente),
    comMotivo(
      {
        codigo: "vencido_a_receber",
        categoria: "Risco",
        rotulo: "Vencido no a receber",
        formula: "A receber vencido / A receber em aberto",
        leitura: "Quanto do que falta entrar já passou do prazo.",
        formato: "percentual",
        valor: fracao(d.aReceberVencido, d.aReceberEmAberto),
      },
      "Nada em aberto a receber."
    ),
    comMotivo(
      {
        codigo: "concentracao_cliente",
        categoria: "Risco",
        rotulo: "Concentração no maior cliente",
        formula: "Maior cliente em aberto / A receber em aberto",
        leitura: "Acima de 40% é dependência: um atraso dele é um mês difícil.",
        formato: "percentual",
        valor: fracao(d.maiorClienteEmAberto, d.aReceberEmAberto),
      },
      "Nada em aberto a receber."
    ),
  ];
}
