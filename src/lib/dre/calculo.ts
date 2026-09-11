// O cálculo do DRE. Função pura, sem banco.
//
// ─── O sinal vem do dado, e toda linha soma ─────────────────────────────────
//
// No Omie o pagamento sai negativo na coluna "Valor Pago" e o recebimento sai
// positivo em "Recebido". A planilha aproveita isso: **todas as fórmulas de
// subtotal são soma**, nunca subtração — `Margem = Receita + CMV + MO +
// Comerciais`, com os três últimos já negativos.
//
// Mantive a convenção. A alternativa seria guardar despesa positiva e subtrair
// linha a linha, e aí cada subtotal novo passa a ser uma chance de errar um
// sinal — que é o tipo de erro que produz número plausível.
//
// ─── Centavos inteiros ──────────────────────────────────────────────────────
//
// Como em todo dinheiro no Connect. Percentual é o único `number` fracionário
// aqui, e ele não volta para conta nenhuma — é saída de tela.

import {
  GRUPOS,
  LINHAS,
  NAO_CLASSIFICADO,
  TRANSFERENCIA,
  OPCOES_PADRAO,
  parcelasDaMargem,
  type OpcoesDoDre,
} from "@/lib/dre/estrutura";

/** Um lançamento pago ou recebido no período. */
export type LancamentoDoDre = {
  /** A categoria como o Omie a nomeia. É o que o de-para casa. */
  categoria: string | null;
  /** Centavos. Negativo em pagamento, positivo em recebimento. */
  valorCentavos: number;
  origem: "recebimento" | "pagamento";
};

/**
 * De-para de categoria para grupo.
 *
 * Chave é a categoria **normalizada** — ver `chaveDaCategoria`. A planilha casa
 * por texto exato com `SUMIF`, e a lista dela tem `Comissões␣␣Produção` com dois
 * espaços e `Outras Taxas` × `Outras taxas`. Cada um desses é um mês em que a
 * linha zera e ninguém percebe.
 */
export type Mapeamento = Map<string, string>;

/**
 * A chave de casamento de categoria.
 *
 * Normaliza espaço repetido, acento e caixa. **Não corrige erro de digitação** —
 * `anáisdeaço` continua sendo outra categoria, e tem de ser: adivinhar que duas
 * grafias diferentes são a mesma coisa é como um valor vai parar no grupo
 * errado sem deixar rastro.
 */
export function chaveDaCategoria(categoria: string): string {
  return categoria
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function montarMapeamento(pares: { categoria: string; grupo: string }[]): Mapeamento {
  const m = new Map<string, string>();
  for (const p of pares) m.set(chaveDaCategoria(p.categoria), p.grupo);
  return m;
}

export type ValorDaLinha = {
  code: string;
  label: string;
  tipo: "grupo" | "subtotal" | "percentual";
  /** Centavos nas linhas de valor; `null` nas de percentual. */
  centavos: number | null;
  /** Fração de 0 a 1 nas de percentual; `null` nas de valor. */
  fracao: number | null;
  destaque: boolean;
};

export type ResultadoDoDre = {
  linhas: ValorDaLinha[];
  /** Total por grupo, inclusive os dois que não entram em conta nenhuma. */
  porGrupo: Record<string, number>;
  /**
   * O que não tem de-para, por categoria, do maior para o menor em valor
   * absoluto — é a fila de classificação da tela.
   */
  naoClassificado: { categoria: string; centavos: number; origem: "recebimento" | "pagamento" }[];
  /**
   * A prova de que nada sumiu: soma de tudo que entrou menos a soma de todos os
   * grupos. **Tem de ser zero, sempre.**
   *
   * A planilha faz esta conferência à mão, em abas `Check` com `VLOOKUP`
   * devolvendo `#N/A`. Aqui ela é um número que a tela pode afirmar.
   */
  diferencaDeFechamento: number;
};

/**
 * Monta o DRE de um período.
 *
 * Lançamento sem categoria, ou com categoria fora do de-para, **não é
 * descartado**: vai para `nao_classificado`, que aparece na tela e não entra em
 * conta nenhuma. É a diferença entre "o relatório não mostra" e "o dinheiro não
 * existe" — e em outubro/2025 essa diferença valia R$ 64.212,71 na planilha.
 */
export function calcularDre(
  lancamentos: LancamentoDoDre[],
  mapeamento: Mapeamento,
  opcoes: OpcoesDoDre = OPCOES_PADRAO
): ResultadoDoDre {
  const porGrupo: Record<string, number> = { [NAO_CLASSIFICADO]: 0, [TRANSFERENCIA]: 0 };
  for (const g of GRUPOS) porGrupo[g.code] = 0;

  const origemDoGrupo = new Map(GRUPOS.map((g) => [g.code, g.origem]));
  const soltos = new Map<string, { centavos: number; origem: "recebimento" | "pagamento" }>();

  let totalEntrado = 0;

  for (const l of lancamentos) {
    totalEntrado += l.valorCentavos;

    const chave = l.categoria ? chaveDaCategoria(l.categoria) : "";
    const grupo = chave ? mapeamento.get(chave) : undefined;

    // Grupo cuja origem não bate com a do lançamento é de-para errado, não
    // dado errado — e somar um recebimento dentro de um grupo de despesa
    // produz número plausível. Cai no não classificado, para alguém olhar.
    const origemEsperada = grupo ? origemDoGrupo.get(grupo) : undefined;
    const serve =
      grupo !== undefined &&
      (grupo === TRANSFERENCIA || origemEsperada === undefined || origemEsperada === l.origem);

    if (!serve) {
      porGrupo[NAO_CLASSIFICADO]! += l.valorCentavos;
      const nome = l.categoria?.trim() || "(sem categoria)";
      const atual = soltos.get(nome);
      soltos.set(nome, {
        centavos: (atual?.centavos ?? 0) + l.valorCentavos,
        origem: l.origem,
      });
      continue;
    }

    porGrupo[grupo] = (porGrupo[grupo] ?? 0) + l.valorCentavos;
  }

  const linhas = montarLinhas(porGrupo, opcoes);

  const somaDosGrupos = Object.values(porGrupo).reduce((a, b) => a + b, 0);

  return {
    linhas,
    porGrupo,
    naoClassificado: [...soltos.entries()]
      .map(([categoria, v]) => ({ categoria, centavos: v.centavos, origem: v.origem }))
      .sort((a, b) => Math.abs(b.centavos) - Math.abs(a.centavos)),
    diferencaDeFechamento: totalEntrado - somaDosGrupos,
  };
}

/**
 * Monta as linhas a partir dos totais por grupo.
 *
 * Separada de `calcularDre` porque a visão anual precisa dela sem ter
 * lançamento nenhum: as colunas de soma e de média do ano são totais por grupo
 * que já foram agregados, e passar por elas o **mesmo** motor de linhas é o que
 * garante que "margem de contribuição" signifique a mesma coisa nas quatorze
 * colunas do relatório.
 */
export function montarLinhas(
  porGrupo: Record<string, number>,
  opcoes: OpcoesDoDre = OPCOES_PADRAO
): ValorDaLinha[] {
  const valor = new Map<string, number>();
  const linhas: ValorDaLinha[] = [];

  for (const linha of LINHAS) {
    if (linha.tipo === "grupo") {
      const c = porGrupo[linha.grupo] ?? 0;
      valor.set(linha.code, c);
      linhas.push({ code: linha.code, label: linha.label, tipo: "grupo", centavos: c, fracao: null, destaque: false });
      continue;
    }

    if (linha.tipo === "subtotal") {
      // A margem é a única linha cuja composição depende de opção — ver
      // `OpcoesDoDre.margemPartirDaLiquida`.
      const parcelas =
        linha.code === "margem_contribuicao" ? parcelasDaMargem(opcoes) : linha.parcelas;
      const c = parcelas.reduce((n, p) => n + (valor.get(p) ?? 0), 0);
      valor.set(linha.code, c);
      linhas.push({
        code: linha.code,
        label: linha.label,
        tipo: "subtotal",
        centavos: c,
        fracao: null,
        destaque: linha.destaque ?? false,
      });
      continue;
    }

    const num = valor.get(linha.numerador) ?? 0;
    const den = valor.get(linha.denominador) ?? 0;
    // Denominador zero devolve `null`, não `Infinity` nem `NaN`: a planilha
    // escreve `IF(x=0,"")` e deixa a célula vazia, e vazio é a leitura certa —
    // "não dá para calcular" não é "zero por cento".
    const fracao = den === 0 ? null : linha.absoluto ? Math.abs(num / den) : num / den;
    linhas.push({
      code: linha.code,
      label: linha.label,
      tipo: "percentual",
      centavos: null,
      fracao,
      destaque: false,
    });
  }

  return linhas;
}

/** O valor de uma linha, por código. Nulo quando a linha é percentual. */
export function centavosDaLinha(r: ResultadoDoDre, code: string): number | null {
  return r.linhas.find((l) => l.code === code)?.centavos ?? null;
}

/**
 * Quanto de imposto ficou fora do resultado.
 *
 * Existe para a tela poder dizer isso em voz alta enquanto
 * `margemPartirDaLiquida` for `false`. Zero quando a opção está ligada, porque
 * aí o imposto já está dentro.
 */
export function impostoForaDoResultado(r: ResultadoDoDre, opcoes: OpcoesDoDre = OPCOES_PADRAO): number {
  if (opcoes.margemPartirDaLiquida) return 0;
  return centavosDaLinha(r, "impostos") ?? 0;
}
