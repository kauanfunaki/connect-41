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
  DESCONSIDERAR,
  OPCOES_PADRAO,
  parcelasDoEbitda,
  type OpcoesDoDre,
} from "@/lib/dre/estrutura";

/**
 * O nome da categoria de quem chega sem categoria nenhuma — o lançamento do
 * financeiro sem `categoryId`, a linha do arquivo do Omie com a coluna vazia.
 * Constante desde 13/10/2026: a fila de classificação precisa reconhecê-lo
 * para não oferecer "criar a categoria (sem categoria)".
 */
export const SEM_CATEGORIA = "(sem categoria)";

/** Um lançamento pago ou recebido no período. */
export type LancamentoDoDre = {
  /** A categoria como o Omie a nomeia. É o que o de-para casa. */
  categoria: string | null;
  /** Centavos. Negativo em pagamento, positivo em recebimento. */
  valorCentavos: number;
  origem: "recebimento" | "pagamento";
  /**
   * Grupo já decidido, sem passar pelo de-para. Só para o que não é categoria:
   * a diferença de acordo e a perda com clientes da DRE econômica — ver
   * `src/lib/financeiro/cobranca/dre.ts`. A conferência de origem vale igual.
   */
  grupo?: string;
  /** Marca a perda com clientes entre os lançamentos de grupo fixo. */
  perda?: boolean;
  /**
   * Centro de custo, quando o lançamento tem um. O cálculo não lê: só o
   * filtro e o quadro da DRE por centro — ver `src/lib/dre/centroDeCusto.ts`.
   */
  centroDeCustoId?: string | null;
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

/** O total de uma categoria num período. */
export type ValorDaCategoria = { categoria: string; centavos: number; origem: "recebimento" | "pagamento" };

/** As categorias de cada um dos doze grupos — o que uma linha do relatório abre. */
export type DetalheDosGrupos = Record<string, ValorDaCategoria[]>;

export type ResultadoDoDre = {
  linhas: ValorDaLinha[];
  /** Total por grupo, inclusive os três que não entram em conta nenhuma. */
  porGrupo: Record<string, number>;
  /**
   * O que não tem de-para, por categoria, do maior para o menor em valor
   * absoluto — é a fila de classificação da tela.
   */
  naoClassificado: ValorDaCategoria[];
  /**
   * O que a empresa mandou desconsiderar (13/10/2026), por categoria, na mesma
   * ordem. O total já está em `porGrupo[DESCONSIDERAR]`; a lista é para a tela
   * dizer **quais** — "R$ 3 mil desconsiderados" sem nome não se confere.
   */
  desconsiderado: ValorDaCategoria[];
  /**
   * As categorias que compõem cada um dos doze grupos, em ordem alfabética
   * (13/10/2026, teste da Amanda; alfabética desde 15/10/2026 — era do maior
   * para o menor): a linha "CMV" do relatório abre e mostra de onde veio o
   * número. Grafias da mesma chave somam numa
   * linha só, com o nome com que a categoria chegou primeiro — como na
   * exportação no modelo do BPO. Vazio quando o resultado não veio de
   * lançamentos (o acumulado, montado de totais por grupo).
   */
  porCategoria: DetalheDosGrupos;
  /**
   * A prova de que nada sumiu: soma de tudo que entrou menos a soma de todos os
   * grupos. **Tem de ser zero, sempre.**
   *
   * A planilha faz esta conferência à mão, em abas `Check` com `VLOOKUP`
   * devolvendo `#N/A`. Aqui ela é um número que a tela pode afirmar.
   */
  diferencaDeFechamento: number;
};

const ORIGEM_DO_GRUPO = new Map(GRUPOS.map((g) => [g.code, g.origem]));

/**
 * O grupo em que um lançamento entra, ou `null` quando ele cai no não
 * classificado.
 *
 * Saiu de dentro de `calcularDre` em 13/10/2026 para a exportação no modelo do
 * BPO (`modeloDoBpo.ts`), que precisa do valor por categoria e não só por
 * grupo — e tem de classificar com **esta** regra, não com uma cópia dela, para
 * o arquivo bater com a tela.
 */
export function grupoDoLancamento(l: LancamentoDoDre, mapeamento: Mapeamento): string | null {
  const chave = l.categoria ? chaveDaCategoria(l.categoria) : "";
  const grupo = l.grupo ?? (chave ? mapeamento.get(chave) : undefined);
  if (grupo === undefined) return null;

  // Grupo cuja origem não bate com a do lançamento é de-para errado, não
  // dado errado — e somar um recebimento dentro de um grupo de despesa
  // produz número plausível. Cai no não classificado, para alguém olhar.
  const origemEsperada = grupo ? ORIGEM_DO_GRUPO.get(grupo) : undefined;
  const serve =
    grupo === TRANSFERENCIA || grupo === DESCONSIDERAR || origemEsperada === undefined || origemEsperada === l.origem;
  return serve ? grupo : null;
}

/**
 * Monta o DRE de um período.
 *
 * Lançamento sem categoria, ou com categoria fora do de-para, **não é
 * descartado**: vai para `nao_classificado`, que aparece na tela e não entra em
 * conta nenhuma. É a diferença entre "o relatório não mostra" e "o dinheiro não
 * existe" — e em outubro/2025 essa diferença valia R$ 64.212,71 na planilha.
 *
 * O desconsiderado também não entra em linha nenhuma, mas por decisão de
 * alguém: vai para o grupo dele, e não para a fila.
 */
export function calcularDre(
  lancamentos: LancamentoDoDre[],
  mapeamento: Mapeamento,
  opcoes: OpcoesDoDre = OPCOES_PADRAO
): ResultadoDoDre {
  const porGrupo: Record<string, number> = { [NAO_CLASSIFICADO]: 0, [TRANSFERENCIA]: 0, [DESCONSIDERAR]: 0 };
  for (const g of GRUPOS) porGrupo[g.code] = 0;

  const soltos = new Map<string, { centavos: number; origem: "recebimento" | "pagamento" }>();
  const desconsiderados = new Map<string, { centavos: number; origem: "recebimento" | "pagamento" }>();
  const doGrupo = new Map<string, Map<string, ValorDaCategoria>>();

  let totalEntrado = 0;

  for (const l of lancamentos) {
    totalEntrado += l.valorCentavos;

    const grupo = grupoDoLancamento(l, mapeamento);

    if (grupo === null || grupo === DESCONSIDERAR) {
      porGrupo[grupo ?? NAO_CLASSIFICADO]! += l.valorCentavos;
      somarNaCategoria(grupo === null ? soltos : desconsiderados, l);
      continue;
    }

    porGrupo[grupo] = (porGrupo[grupo] ?? 0) + l.valorCentavos;
    if (grupo !== TRANSFERENCIA) somarNoDetalhe(doGrupo, grupo, l);
  }

  const linhas = montarLinhas(porGrupo, opcoes);

  const somaDosGrupos = Object.values(porGrupo).reduce((a, b) => a + b, 0);

  return {
    linhas,
    porGrupo,
    naoClassificado: porCategoria(soltos),
    desconsiderado: porCategoria(desconsiderados),
    porCategoria: Object.fromEntries(
      [...doGrupo.entries()].map(([grupo, mapa]) => [grupo, [...mapa.values()].sort((a, b) => compararCategorias(a.categoria, b.categoria))])
    ),
    diferencaDeFechamento: totalEntrado - somaDosGrupos,
  };
}

/**
 * O nome de um lançamento no detalhe da linha. O de grupo fixo da DRE
 * econômica não tem categoria — é a diferença de um acordo ou a perda com
 * clientes (ver `src/lib/financeiro/cobranca/dre.ts`), e sai com esse nome.
 */
function nomeNoDetalhe(l: LancamentoDoDre): string {
  const nome = l.categoria?.trim();
  if (nome) return nome;
  if (l.grupo !== undefined) return l.perda ? "Perda com clientes" : "Diferença de acordo";
  return SEM_CATEGORIA;
}

function somarNoDetalhe(doGrupo: Map<string, Map<string, ValorDaCategoria>>, grupo: string, l: LancamentoDoDre): void {
  let mapa = doGrupo.get(grupo);
  if (!mapa) doGrupo.set(grupo, (mapa = new Map()));
  const nome = nomeNoDetalhe(l);
  const chave = chaveDaCategoria(nome);
  const atual = mapa.get(chave);
  if (atual) atual.centavos += l.valorCentavos;
  else mapa.set(chave, { categoria: nome, centavos: l.valorCentavos, origem: l.origem });
}

const ORDEM_ALFABETICA = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/**
 * A ordem das categorias quando a linha da DRE abre, no mês e no ano, no
 * Connect e no portal (pedido de 15/10/2026): alfabética, sem diferença de
 * caixa nem de acento — "Água" fica entre as do A. A fila de classificação e o
 * resumo do desconsiderado seguem do maior para o menor: lá a pergunta é "o que
 * pesa mais", não "onde está".
 */
export function compararCategorias(a: string, b: string): number {
  return ORDEM_ALFABETICA.compare(a, b);
}

function doMaiorParaOMenor(lista: ValorDaCategoria[]): ValorDaCategoria[] {
  return lista.sort((a, b) => Math.abs(b.centavos) - Math.abs(a.centavos));
}

function somarNaCategoria(
  mapa: Map<string, { centavos: number; origem: "recebimento" | "pagamento" }>,
  l: LancamentoDoDre
): void {
  const nome = l.categoria?.trim() || SEM_CATEGORIA;
  const atual = mapa.get(nome);
  mapa.set(nome, { centavos: (atual?.centavos ?? 0) + l.valorCentavos, origem: l.origem });
}

/** Do maior para o menor em valor absoluto — a ordem da fila e do resumo. */
function porCategoria(mapa: Map<string, { centavos: number; origem: "recebimento" | "pagamento" }>): ValorDaCategoria[] {
  return doMaiorParaOMenor([...mapa.entries()].map(([categoria, v]) => ({ categoria, centavos: v.centavos, origem: v.origem })));
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
      // O EBITDA é a única linha cuja composição depende de opção — ver
      // `OpcoesDoDre.impostosNoEbitda`.
      const parcelas = linha.code === "ebitda" ? parcelasDoEbitda(opcoes) : linha.parcelas;
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
 * Existe para a tela poder dizer isso em voz alta na visão da Irriga
 * (`impostosNoEbitda: false`). Zero na visão padrão, porque aí o imposto já
 * está dentro do EBITDA.
 */
export function impostoForaDoResultado(r: ResultadoDoDre, opcoes: OpcoesDoDre = OPCOES_PADRAO): number {
  if (opcoes.impostosNoEbitda) return 0;
  return centavosDaLinha(r, "impostos") ?? 0;
}
