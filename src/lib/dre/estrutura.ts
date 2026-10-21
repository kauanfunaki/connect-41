// A estrutura do DRE, como a 41 o monta.
//
// ─── Um modelo por empresa (21/10/2026) ─────────────────────────────────────
//
// A visualização do DRE depende do cliente (pedido do Kauan, 21/10/2026): há
// o **padrão** e há os **customizados**. A empresa escolhe o dela
// (`Company.dreModelo`); vazio é o padrão. Os modelos moram em código:
//
// - **Padrão** (`MODELO_PADRAO`, este arquivo): sete grupos — receita bruta,
//   impostos, custo operacional, custo administrativo, financiamentos, outras
//   despesas (com os investimentos) e outras receitas — e as linhas receita
//   líquida, margem de contribuição, gerador de caixa (EBITDA) e resultado
//   líquido operacional. É o modelo novo de DRE que a Amanda mandou em
//   20/10/2026, com o cálculo do modelo anterior: a base é a receita bruta (a
//   soma dos recebimentos) — a planilha do modelo novo usa um "Faturamento
//   fiscal" digitado à mão, a parte customizada para aquela empresa, que fica
//   de fora. Os impostos têm duas visões, com a escolha na tela: no EBITDA ou
//   fora do resultado (`OpcoesDoDre`).
// - **Despesas por área** (`MODELO_POR_AREA`, `estruturaPorArea.ts`): o que
//   era o padrão até 20/10/2026 — doze grupos, as despesas abertas por área
//   (comerciais, pessoal, diretoria, administrativas, financeiras), os
//   investimentos à parte e o fluxo de caixa livre no fim, com os impostos
//   sempre fora do resultado. Volta como customizado para quem usava.
//
// Os percentuais são sobre a receita bruta: despesa em valor absoluto ("24%",
// não "−24%"), resultado com o sinal.
//
// O que estava classificado nos doze grupos migrou para os sete pelo de-para
// `GRUPO_DO_ANTIGO` (migration `20261020230000_dre_padrao_cargo`). Quem volta
// ao modelo por área tem a classificação refeita pelo histórico — ver
// `restauracaoPorArea.ts`.
//
// ─── O que é fixo e o que é por cliente ─────────────────────────────────────
//
// **Fixo, e por isso mora em código:** os grupos, as linhas do relatório e as
// contas entre elas — o modelo gerencial da 41.
//
// **Por cliente, e por isso mora em tabela:** o de-para de categoria para
// grupo. Cada empresa tem as categorias dela.
//
// ─── Regime de caixa ────────────────────────────────────────────────────────
//
// O DRE de caixa soma o que foi pago e recebido no mês (as baixas). A DRE
// econômica (`economica.ts`) usa a mesma estrutura pela competência.

import { MODELO_POR_AREA } from "./estruturaPorArea";

/** De onde o valor de um grupo vem. */
export type OrigemDoGrupo = "recebimento" | "pagamento";

export type GrupoDoDre = {
  code: string;
  label: string;
  origem: OrigemDoGrupo;
};

/**
 * Os sete grupos que recebem categorias, na ordem do relatório.
 *
 * `origem` existe porque o mesmo nome de categoria pode aparecer dos dois
 * lados — e somar um recebimento dentro de um grupo de despesa é o erro que
 * produz um número plausível e errado.
 */
export const GRUPOS: GrupoDoDre[] = [
  { code: "receita_bruta", label: "Receita Bruta", origem: "recebimento" },
  { code: "impostos", label: "Impostos sobre Receita Bruta", origem: "pagamento" },
  { code: "custo_operacional", label: "Custo Operacional", origem: "pagamento" },
  { code: "custo_administrativo", label: "Custo Administrativo", origem: "pagamento" },
  { code: "financiamentos", label: "Financiamentos, Empréstimos e Parcelamentos", origem: "pagamento" },
  { code: "outras_despesas", label: "Outras Despesas (com Investimentos)", origem: "pagamento" },
  { code: "outras_receitas", label: "Outras Receitas", origem: "recebimento" },
];

/**
 * Os grupos do padrão antigo (o modelo por área, até 20/10/2026) e o grupo novo de
 * cada um. É o de-para da migration e o de quem ainda lê um código antigo —
 * um orçamento exportado, uma planilha guardada: `grupoAtual` traduz.
 *
 * As "financeiras" vão para o custo administrativo, não para financiamentos:
 * eram tarifa do banco e IOF, uma das despesas fixas — e o modelo novo põe a
 * tarifa no administrativo. Financiamentos é empréstimo e parcelamento.
 */
export const GRUPO_DO_ANTIGO: Readonly<Record<string, string>> = {
  cmv: "custo_operacional",
  mao_de_obra: "custo_operacional",
  comerciais: "custo_operacional",
  pessoal: "custo_administrativo",
  diretoria: "custo_administrativo",
  administrativas: "custo_administrativo",
  financeiras: "custo_administrativo",
  investimentos: "outras_despesas",
};

/** Os rótulos do padrão antigo, pelo grupo novo — o `dreGroup` é texto livre, e há quem tenha digitado o rótulo. */
export const ROTULOS_DO_PADRAO_ANTIGO: Readonly<Record<string, string>> = {
  "CMV sobre Receita Bruta": "custo_operacional",
  "Mão de Obra sobre Receita Bruta": "custo_operacional",
  "Despesas Fixas (Comerciais)": "custo_operacional",
  "Despesas Fixas (Pessoal)": "custo_administrativo",
  "Despesas Fixas (Diretoria)": "custo_administrativo",
  "Despesas Fixas (Administrativas)": "custo_administrativo",
  "Despesas Fixas (Financeiras)": "custo_administrativo",
  "Investimentos Totais": "outras_despesas",
  "Outras Receitas Totais": "outras_receitas",
  "Outras Despesas Totais (Receitas e Despesas Não Operacionais)": "outras_despesas",
};

/** O código de grupo no padrão de hoje: o antigo vira o novo; o resto fica como está. */
export function grupoAtual(code: string): string {
  return GRUPO_DO_ANTIGO[code] ?? code;
}

export function grupoPorCodigo(code: string): GrupoDoDre | null {
  return GRUPOS.find((g) => g.code === code) ?? null;
}

/**
 * O grupo que recebe o que não foi classificado.
 *
 * **Não é um dos sete.** Ele existe para que dinheiro sem de-para apareça no
 * relatório em vez de sumir — que é o que a planilha faz: o `SUMIF`
 * simplesmente não encontra categoria que não está na lista.
 *
 * Ele não entra em nenhuma conta de resultado. Serve para ser visto e zerado.
 */
export const NAO_CLASSIFICADO = "nao_classificado";

/**
 * Transferência entre contas da própria empresa.
 *
 * "Entrada de Transferência" e "Saída de Transferência" aparecem no extrato e
 * **não são resultado**: é dinheiro andando entre contas do mesmo dono. Aqui
 * elas ganham um grupo próprio, que não entra em conta nenhuma — mas aparece
 * nomeado. "Excluído de propósito" e "ninguém classificou" não são a mesma
 * coisa na tela.
 */
export const TRANSFERENCIA = "transferencia";

/**
 * Categoria que a empresa decidiu **não considerar** no DRE (pedido do Kauan,
 * 13/10/2026).
 *
 * Fica fora de todas as linhas e fora do não classificado — sai da fila de
 * classificação, que é o que a escolha quer dizer. O valor continua somado em
 * `porGrupo[DESCONSIDERAR]` (a conferência de fechamento segue zerando) e a
 * tela mostra quanto ficou de fora.
 */
export const DESCONSIDERAR = "desconsiderar";

/**
 * As escolhas que tiram a categoria do resultado, com o rótulo do seletor.
 * Vêm depois dos grupos em todo seletor de grupo do DRE — a fila, o plano do
 * escritório e o plano da empresa —, para os três dizerem a mesma coisa.
 */
export const FORA_DO_RESULTADO: { code: string; label: string }[] = [
  { code: TRANSFERENCIA, label: "Transferência entre contas (fora do DRE)" },
  { code: DESCONSIDERAR, label: "Desconsiderar no DRE" },
];

/** Os grupos e as duas escolhas de fora, na ordem dos seletores. */
export const ESCOLHAS_DE_GRUPO: { code: string; label: string }[] = [
  ...GRUPOS.map((g) => ({ code: g.code, label: g.label })),
  ...FORA_DO_RESULTADO,
];

/**
 * O rótulo de um código de grupo no modelo, ou o próprio texto quando não é
 * um. No padrão, o código antigo sai com o rótulo do grupo novo que o absorveu.
 */
export function rotuloDoGrupo(code: string, modelo?: ModeloDoDre): string {
  if (modelo && modelo.codigo !== "padrao") return escolhasDeGrupo(modelo).find((g) => g.code === code)?.label ?? code;
  const atual = grupoAtual(code);
  return ESCOLHAS_DE_GRUPO.find((g) => g.code === atual)?.label ?? code;
}

/**
 * O grupo aceita lançamento deste lado? Os de fora do resultado aceitam os
 * dois — transferência e desconsiderada não somam em linha nenhuma, então a
 * conferência de origem não tem o que proteger. Vale para o grupo de qualquer
 * modelo: a origem de um código é a mesma em todos.
 */
export function grupoAceitaOrigem(code: string, origem: OrigemDoGrupo): boolean {
  const esperada = origemDoGrupo(code);
  return esperada ? esperada === origem : FORA_DO_RESULTADO.some((f) => f.code === code);
}

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
   * aparece com o sinal.
   */
  | { code: string; label: string; tipo: "percentual"; numerador: string; denominador: string; absoluto: boolean };

const PCT = (code: string, label: string, numerador: string, absoluto: boolean): LinhaDoDre => ({
  code,
  label,
  tipo: "percentual",
  numerador,
  // Todo percentual do padrão é sobre a receita bruta.
  denominador: "receita_bruta",
  absoluto,
});

/**
 * O relatório, na ordem da aba `DRE FINANCEIRO` do modelo novo.
 *
 * As parcelas do EBITDA dependem da opção dos impostos — as daqui são as com
 * os impostos dentro; `parcelasDoSubtotal` tira na visão "fora do resultado".
 */
export const LINHAS: LinhaDoDre[] = [
  { code: "receita_bruta", label: "RECEITA BRUTA", tipo: "grupo", grupo: "receita_bruta" },
  { code: "impostos", label: "IMPOSTOS SOBRE RECEITA BRUTA", tipo: "grupo", grupo: "impostos" },
  PCT("impostos_pct", "Impostos sobre Receita Bruta %", "impostos", true),
  { code: "receita_liquida", label: "RECEITA LÍQUIDA", tipo: "subtotal", parcelas: ["receita_bruta", "impostos"] },

  { code: "custo_operacional", label: "CUSTO OPERACIONAL TOTAL", tipo: "grupo", grupo: "custo_operacional" },
  PCT("custo_operacional_pct", "Custo Operacional sobre Receita Bruta %", "custo_operacional", true),
  {
    code: "margem_contribuicao",
    label: "MARGEM DE CONTRIBUIÇÃO",
    tipo: "subtotal",
    // Como nas duas planilhas: a margem parte da receita bruta.
    parcelas: ["receita_bruta", "custo_operacional"],
    destaque: true,
  },
  PCT("margem_contribuicao_pct", "Margem de Contribuição sobre Receita Bruta %", "margem_contribuicao", false),

  { code: "custo_administrativo", label: "CUSTO ADMINISTRATIVO TOTAL", tipo: "grupo", grupo: "custo_administrativo" },
  PCT("custo_administrativo_pct", "Custo Administrativo sobre Receita Bruta %", "custo_administrativo", true),
  {
    code: "financiamentos",
    label: "DESPESAS TOTAIS COM FINANCIAMENTOS, EMPRÉSTIMOS E PARCELAMENTOS",
    tipo: "grupo",
    grupo: "financiamentos",
  },
  PCT("financiamentos_pct", "Financiamentos, Empréstimos e Parcelamentos sobre Receita Bruta %", "financiamentos", true),
  {
    code: "ebitda",
    label: "GERADOR DE CAIXA (EBITDA)",
    tipo: "subtotal",
    parcelas: ["margem_contribuicao", "impostos", "custo_administrativo", "financiamentos"],
    destaque: true,
  },
  PCT("ebitda_pct", "Gerador de Caixa (EBITDA) sobre Receita Bruta %", "ebitda", false),

  { code: "outras_despesas", label: "OUTRAS DESPESAS TOTAIS (COM INVESTIMENTOS)", tipo: "grupo", grupo: "outras_despesas" },
  PCT("outras_despesas_pct", "Outras Despesas sobre Receita Bruta %", "outras_despesas", true),
  { code: "outras_receitas", label: "OUTRAS RECEITAS TOTAIS", tipo: "grupo", grupo: "outras_receitas" },
  PCT("outras_receitas_pct", "Outras Receitas sobre Receita Bruta %", "outras_receitas", false),

  {
    code: "resultado_liquido",
    label: "RESULTADO LÍQUIDO OPERACIONAL",
    tipo: "subtotal",
    parcelas: ["ebitda", "outras_despesas", "outras_receitas"],
    destaque: true,
  },
  PCT("resultado_liquido_pct", "Resultado Líquido Operacional sobre Receita Bruta %", "resultado_liquido", false),
];

/** A linha que fecha o relatório — o resultado do período. */
export const LINHA_DO_RESULTADO = "resultado_liquido";

export function linhaPorCodigo(code: string): LinhaDoDre | null {
  return LINHAS.find((l) => l.code === code) ?? null;
}

// ─── Os modelos ─────────────────────────────────────────────────────────────

export type CodigoDoModelo = "padrao" | "por_area";

/** Uma premissa do simulador de cenários e os grupos em que ela vale. */
export type CampoDoSimulador = {
  chave: "custoOperacional" | "custoAdministrativo" | "financiamentos";
  rotulo: string;
  dica: string;
  grupos: string[];
};

/**
 * Um modelo de DRE: os grupos, as linhas e o que cada tela precisa saber dele.
 * Tudo que dependia de um código de linha fixo ("ebitda", "custo_operacional")
 * nas telas e nas análises mora aqui, para o modelo da empresa valer em todas.
 */
export type ModeloDoDre = {
  codigo: CodigoDoModelo;
  /** O nome no seletor da empresa. */
  nome: string;
  /** Uma frase para o seletor e a ajuda. */
  descricao: string;
  grupos: GrupoDoDre[];
  linhas: LinhaDoDre[];
  /** O resultado operacional (o EBITDA, o gerador de caixa) e o resultado final. */
  linhaOperacional: string;
  linhaDoResultado: string;
  /**
   * Os impostos sobre a receita: `escolha` — a tela alterna entre no EBITDA e
   * fora do resultado; `fora` — sempre fora, como a planilha do modelo.
   */
  impostos: "escolha" | "fora";
  /** O rótulo das linhas de resultado lidas por competência (DRE econômica). */
  rotulosEconomicos: Readonly<Record<string, string>>;
  /** Os nomes dos dois resultados nos cartões do topo: [operacional, final]. */
  numeros: { caixa: readonly [string, string]; competencia: readonly [string, string] };
  analises: {
    /** As linhas do comparativo, na ordem. */
    comparativo: string[];
    /** As linhas lado a lado na comparação caixa × competência. */
    principais: string[];
    /** As linhas somadas no indicador "peso das despesas fixas", e a fórmula dele. */
    estrutura: string[];
    formulaDaEstrutura: string;
    /** O que a margem operacional quer dizer neste modelo. */
    leituraDoOperacional: string;
    /** Os grupos de despesa que a pergunta "o operacional caiu?" não conta. */
    foraDoOperacional: string[];
  };
  simulador: {
    /** As linhas da tabela do simulador. */
    linhas: string[];
    /** O que acompanha a premissa de receita, para a dica do campo. */
    dicaDaReceita: string;
    /** Os grupos que andam junto com a receita. */
    variaveis: string[];
    campos: CampoDoSimulador[];
  };
  /** Os subtotais da grade do orçamento. */
  subtotaisDoOrcamento: string[];
};

export const MODELO_PADRAO: ModeloDoDre = {
  codigo: "padrao",
  nome: "Padrão",
  descricao: "Custo operacional, custo administrativo e financiamentos; EBITDA e resultado líquido operacional.",
  grupos: GRUPOS,
  linhas: LINHAS,
  linhaOperacional: "ebitda",
  linhaDoResultado: LINHA_DO_RESULTADO,
  impostos: "escolha",
  rotulosEconomicos: {
    ebitda: "RESULTADO OPERACIONAL (EBITDA)",
    ebitda_pct: "Resultado Operacional (EBITDA) sobre Receita Bruta %",
    resultado_liquido: "RESULTADO DO PERÍODO",
    resultado_liquido_pct: "Resultado do Período sobre Receita Bruta %",
  },
  numeros: {
    caixa: ["Gerador de caixa (EBITDA)", "Resultado líquido operacional"],
    competencia: ["Resultado operacional (EBITDA)", "Resultado do período"],
  },
  analises: {
    comparativo: [
      "receita_bruta",
      "impostos",
      "receita_liquida",
      "custo_operacional",
      "margem_contribuicao",
      "custo_administrativo",
      "financiamentos",
      "ebitda",
      "outras_despesas",
      "outras_receitas",
      "resultado_liquido",
    ],
    principais: [
      "receita_bruta",
      "impostos",
      "custo_operacional",
      "margem_contribuicao",
      "custo_administrativo",
      "financiamentos",
      "ebitda",
      "outras_despesas",
      "resultado_liquido",
    ],
    estrutura: ["custo_administrativo", "financiamentos"],
    formulaDaEstrutura: "|Custo administrativo + Financiamentos| / Receita bruta",
    leituraDoOperacional: "O gerador de caixa (EBITDA): o resultado da operação antes das outras despesas e receitas.",
    foraDoOperacional: ["outras_despesas", "outras_receitas"],
  },
  simulador: {
    linhas: ["receita_bruta", "margem_contribuicao", "custo_administrativo", "ebitda", "resultado_liquido"],
    dicaDaReceita: "Impostos e custo operacional acompanham.",
    variaveis: ["impostos", "custo_operacional"],
    campos: [
      {
        chave: "custoOperacional",
        rotulo: "Custo operacional além da receita",
        dica: "Custo que sobe mais (ou menos) que a venda.",
        grupos: ["custo_operacional"],
      },
      {
        chave: "custoAdministrativo",
        rotulo: "Custo administrativo",
        dica: "A estrutura: pessoal do administrativo, pró-labore, aluguel, sistemas.",
        grupos: ["custo_administrativo"],
      },
      { chave: "financiamentos", rotulo: "Financiamentos e empréstimos", dica: "Parcelas, juros e parcelamentos.", grupos: ["financiamentos"] },
    ],
  },
  subtotaisDoOrcamento: ["receita_liquida", "margem_contribuicao", "ebitda", "resultado_liquido"],
};

export type OpcoesDoDre = {
  /**
   * Os impostos sobre a receita entram no EBITDA (e daí no resultado)? Só no
   * modelo que deixa escolher (`impostos: "escolha"`, o padrão):
   *
   * - `true` — **o padrão**: como as duas abas do modelo novo fecham. A margem
   *   parte da receita bruta, e o EBITDA desconta os impostos.
   * - `false` — os impostos aparecem na receita líquida e ficam fora da margem,
   *   do EBITDA e do resultado. A tela diz quanto ficou de fora
   *   (`impostoForaDoResultado`).
   *
   * O Kauan pediu as duas, com a escolha na tela (20/10/2026).
   */
  impostosNoEbitda: boolean;
  /**
   * O modelo da empresa. Vazio é o padrão; os loaders (`data.ts`,
   * `dataEconomica.ts`) preenchem com o da empresa quando quem chama não diz.
   */
  modelo?: ModeloDoDre;
};

export const OPCOES_PADRAO: OpcoesDoDre = { impostosNoEbitda: true };

/** Os impostos fora do resultado. */
export const OPCOES_SEM_IMPOSTOS: OpcoesDoDre = { impostosNoEbitda: false };

/** As opções a partir do endereço da tela: `impostos=fora` tira os impostos do resultado. */
export function opcoesDaUrl(valor: string | null | undefined, modelo?: ModeloDoDre): OpcoesDoDre {
  const base = valor === "fora" ? OPCOES_SEM_IMPOSTOS : OPCOES_PADRAO;
  return modelo ? { ...base, modelo } : base;
}

/** O modelo das opções — o padrão quando elas não dizem. */
export function modeloDas(opcoes: OpcoesDoDre | undefined): ModeloDoDre {
  return opcoes?.modelo ?? MODELO_PADRAO;
}

/**
 * As parcelas de um subtotal, conforme a opção dos impostos: no modelo que
 * deixa escolher, a linha operacional (o EBITDA) perde os impostos quando a
 * visão é "fora do resultado". Nos outros, as parcelas são as da linha.
 */
export function parcelasDoSubtotal(linha: Extract<LinhaDoDre, { tipo: "subtotal" }>, opcoes: OpcoesDoDre): string[] {
  const modelo = modeloDas(opcoes);
  const tira = modelo.impostos === "escolha" && linha.code === modelo.linhaOperacional && !opcoes.impostosNoEbitda;
  return tira ? linha.parcelas.filter((p) => p !== "impostos") : linha.parcelas;
}

/** As parcelas do EBITDA do padrão, conforme a opção dos impostos. */
export function parcelasDoEbitda(opcoes: OpcoesDoDre): string[] {
  const linha = linhaPorCodigo("ebitda");
  return linha?.tipo === "subtotal" ? parcelasDoSubtotal(linha, { ...opcoes, modelo: MODELO_PADRAO }) : [];
}

// ─── O registro ─────────────────────────────────────────────────────────────

/** Os modelos que a empresa pode escolher, na ordem do seletor. */
export const MODELOS: ModeloDoDre[] = [MODELO_PADRAO, MODELO_POR_AREA];

/** O modelo de um código gravado na empresa — vazio ou desconhecido é o padrão. */
export function modeloDoCodigo(codigo: string | null | undefined): ModeloDoDre {
  return MODELOS.find((m) => m.codigo === codigo) ?? MODELO_PADRAO;
}

/** O código é de um modelo que existe? Para validar o que chega da tela. */
export function ehCodigoDeModelo(codigo: string): codigo is CodigoDoModelo {
  return MODELOS.some((m) => m.codigo === codigo);
}

function semRepetir<T extends { code: string }>(lista: T[]): T[] {
  const vistos = new Set<string>();
  return lista.filter((x) => (vistos.has(x.code) ? false : (vistos.add(x.code), true)));
}

/**
 * Os grupos de todos os modelos, um por código. O mesmo código tem a mesma
 * origem em todos ("outras_despesas" é pagamento no padrão e no por área), e é
 * isso que deixa a conferência de origem e o alerta de orçamento valerem sem
 * saber o modelo.
 */
export const TODOS_OS_GRUPOS: GrupoDoDre[] = semRepetir(MODELOS.flatMap((m) => m.grupos));

/** As linhas de todos os modelos, uma por código — para quem só precisa saber o tipo de uma linha. */
export const TODAS_AS_LINHAS: LinhaDoDre[] = semRepetir(MODELOS.flatMap((m) => m.linhas));

const ORIGEM_DE_TODOS = new Map(TODOS_OS_GRUPOS.map((g) => [g.code, g.origem]));

/** A origem de um grupo de qualquer modelo; vazio quando o código não é grupo. */
export function origemDoGrupo(code: string): OrigemDoGrupo | undefined {
  return ORIGEM_DE_TODOS.get(code);
}

/** Os grupos do modelo e as duas escolhas de fora, na ordem dos seletores. */
export function escolhasDeGrupo(modelo: ModeloDoDre): { code: string; label: string }[] {
  return [...modelo.grupos.map((g) => ({ code: g.code, label: g.label })), ...FORA_DO_RESULTADO];
}
