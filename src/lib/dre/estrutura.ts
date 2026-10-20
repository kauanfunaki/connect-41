// A estrutura do DRE, como a 41 o monta.
//
// ─── O padrão desde 20/10/2026: a estrutura do modelo novo, o cálculo da Irriga ───
//
// Até aqui o padrão era o da Irriga (`10-DRE Irriga_2025_010.xlsx`, lida em
// 11/09/2026), com as despesas abertas por área — comerciais, pessoal,
// diretoria, administrativas, financeiras — porque a Irriga pediu assim. Em
// 20/10/2026 a Amanda mandou o modelo novo de DRE, o de uma empresa cliente
// (aba `DRE FINANCEIRO`), e o Kauan decidiu: **a estrutura é a do modelo novo,
// o cálculo é o da Irriga, e todas as empresas — a Irriga inclusive — usam este
// padrão.**
//
// - **Estrutura do modelo novo:** sete grupos — receita bruta, impostos, custo
//   operacional, custo administrativo, financiamentos, outras despesas (com os
//   investimentos) e outras receitas — e as linhas receita líquida, margem de
//   contribuição, gerador de caixa (EBITDA) e resultado líquido operacional.
// - **Cálculo da Irriga:** a base é a receita bruta (a soma dos recebimentos).
//   A planilha do modelo novo usa um "Faturamento fiscal" digitado à mão como
//   base de quase tudo — é a parte customizada para aquela empresa, e fica de
//   fora. Os
//   percentuais são sobre a receita bruta: despesa em valor absoluto
//   ("24%", não "−24%"), resultado com o sinal.
// - **Os impostos, nas duas visões** (pedido do Kauan): no EBITDA, como as
//   duas abas do modelo novo fecham, ou fora do resultado, como a Irriga — ver
//   `OpcoesDoDre`. A tela alterna.
//
// O que era da Irriga e já estava classificado migra pelo de-para
// `GRUPO_DO_ANTIGO` (migration `20261020230000_dre_padrao_cargo`).
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
 * Os grupos do padrão antigo (o da Irriga, até 20/10/2026) e o grupo novo de
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

/** O rótulo de um código de grupo — o antigo pelo novo —, ou o próprio texto quando não é um. */
export function rotuloDoGrupo(code: string): string {
  const atual = grupoAtual(code);
  return ESCOLHAS_DE_GRUPO.find((g) => g.code === atual)?.label ?? code;
}

/**
 * O grupo aceita lançamento deste lado? Os de fora do resultado aceitam os
 * dois — transferência e desconsiderada não somam em linha nenhuma, então a
 * conferência de origem não tem o que proteger.
 */
export function grupoAceitaOrigem(code: string, origem: OrigemDoGrupo): boolean {
  const grupo = grupoPorCodigo(code);
  return grupo ? grupo.origem === origem : FORA_DO_RESULTADO.some((f) => f.code === code);
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
  // O cálculo da Irriga: todo percentual é sobre a receita bruta.
  denominador: "receita_bruta",
  absoluto,
});

/**
 * O relatório, na ordem da aba `DRE FINANCEIRO` do modelo novo.
 *
 * As parcelas do EBITDA dependem da opção dos impostos — as daqui são as com
 * os impostos dentro; `parcelasDoEbitda` tira quando a visão é a da Irriga.
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

export type OpcoesDoDre = {
  /**
   * Os impostos sobre a receita entram no EBITDA (e daí no resultado)?
   *
   * - `true` — **o padrão**: como as duas abas do modelo novo fecham. A margem parte
   *   da receita bruta, e o EBITDA desconta os impostos.
   * - `false` — a visão da Irriga: os impostos aparecem na receita líquida e
   *   ficam fora da margem, do EBITDA e do resultado. A tela diz quanto ficou
   *   de fora (`impostoForaDoResultado`).
   *
   * O Kauan pediu as duas, com a escolha na tela (20/10/2026).
   */
  impostosNoEbitda: boolean;
};

export const OPCOES_PADRAO: OpcoesDoDre = { impostosNoEbitda: true };

/** A visão da Irriga: os impostos fora do resultado. */
export const OPCOES_SEM_IMPOSTOS: OpcoesDoDre = { impostosNoEbitda: false };

/** As opções a partir do endereço da tela: `impostos=fora` é a visão da Irriga. */
export function opcoesDaUrl(valor: string | null | undefined): OpcoesDoDre {
  return valor === "fora" ? OPCOES_SEM_IMPOSTOS : OPCOES_PADRAO;
}

/** As parcelas do EBITDA, conforme a opção dos impostos. */
export function parcelasDoEbitda(opcoes: OpcoesDoDre): string[] {
  const linha = linhaPorCodigo("ebitda");
  const parcelas = linha?.tipo === "subtotal" ? linha.parcelas : [];
  return opcoes.impostosNoEbitda ? parcelas : parcelas.filter((p) => p !== "impostos");
}
