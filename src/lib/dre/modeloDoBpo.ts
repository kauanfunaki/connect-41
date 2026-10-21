// A DRE de caixa no desenho da planilha que o BPO entrega — as linhas, sem Excel.
//
// ─── O modelo ───────────────────────────────────────────────────────────────
//
// A aba `DRE FINANCEIRO` da planilha que o setor usa hoje (a DRE de um grupo,
// três anos lado a lado), confirmada pelo Kauan em 13/10/2026 como o modelo da
// exportação. Desde 20/10/2026 é também a estrutura do Connect (a do modelo novo —
// ver o cabeçalho de `estrutura.ts`): um bloco por grupo, na mesma ordem.
//
//   faturamento (uma linha por categoria)  → RECEITA BRUTA
//   impostos                               → IMPOSTOS SOBRE RECEITA BRUTA, %, RECEITA LÍQUIDA
//   custos operacionais                    → CUSTO OPERACIONAL TOTAL, %, MARGEM DE CONTRIBUIÇÃO, %
//   custos administrativos                 → CUSTO ADMINISTRATIVO TOTAL, %
//   financiamentos e empréstimos           → DESPESAS TOTAIS FINANCIAMENTOS…, %, GERADOR DE CAIXA (EBITDA), %
//   outras despesas                        → OUTRAS DESPESAS TOTAIS, %
//   outras receitas                        → OUTRAS RECEITAS TOTAIS, %
//                                            RESULTADO LÍQUIDO OPERACIONAL, %
//
// ─── Os sinais, como no modelo ──────────────────────────────────────────────
//
// No Connect a despesa é negativa e todo subtotal é soma (ver `calculo.ts`). Na
// planilha do BPO o pagamento entra **positivo** (a coluna "Valor Pago" do
// Omie) e os resultados subtraem: `RECEITA LÍQUIDA = B6-B8`. Aqui o valor sai
// no sinal do modelo, para as fórmulas copiadas dele fecharem sem adaptação.
//
// ─── Fórmula e valor, os dois ───────────────────────────────────────────────
//
// Subtotal e percentual saem como fórmula do Excel, como no modelo — quem
// recebe o arquivo mexe numa categoria e o resto acompanha. Cada célula leva
// também o valor já calculado: é o que aparece em quem abre sem recalcular (a
// pré-visualização do e-mail, do Drive, do celular), e é o que os testes leem.

import { grupoDoLancamento, chaveDaCategoria, SEM_CATEGORIA, type LancamentoDoDre, type Mapeamento } from "@/lib/dre/calculo";
import { DESCONSIDERAR, OPCOES_PADRAO, TRANSFERENCIA, modeloDas, type ModeloDoDre, type OpcoesDoDre } from "@/lib/dre/estrutura";

export type CodigoDoBloco =
  | "receita"
  | "impostos"
  | "custo_operacional"
  | "custo_administrativo"
  | "financiamentos"
  | "outras_despesas"
  | "outras_receitas";

type BlocoDoModelo = {
  code: CodigoDoBloco;
  /** Os grupos do Connect cujas categorias entram neste bloco. */
  grupos: string[];
  /** Receita sai em azul e soma; despesa sai em vermelho e subtrai. */
  natureza: "receita" | "despesa";
  /** A linha de total do bloco — e o "onde entrou" da aba de conferência. */
  total: string;
};

/**
 * Onde cada grupo do Connect cai no modelo: desde 20/10/2026, um bloco por
 * grupo — a estrutura do Connect passou a ser a deste modelo (o modelo novo).
 *
 * A categoria vai **pelo grupo dela**, nunca pelo nome: o de-para do Connect já
 * é a decisão de onde cada categoria entra, e reabri-la aqui faria o arquivo
 * discordar da tela.
 */
export const BLOCOS_DO_MODELO: BlocoDoModelo[] = [
  { code: "receita", grupos: ["receita_bruta"], natureza: "receita", total: "RECEITA BRUTA" },
  { code: "impostos", grupos: ["impostos"], natureza: "despesa", total: "IMPOSTOS SOBRE RECEITA BRUTA" },
  { code: "custo_operacional", grupos: ["custo_operacional"], natureza: "despesa", total: "CUSTO OPERACIONAL TOTAL" },
  { code: "custo_administrativo", grupos: ["custo_administrativo"], natureza: "despesa", total: "CUSTO ADMINISTRATIVO TOTAL" },
  {
    code: "financiamentos",
    grupos: ["financiamentos"],
    natureza: "despesa",
    total: "DESPESAS TOTAIS FINANCIAMENTOS, EMPRÉSTIMOS e PARCELAMENTOS",
  },
  { code: "outras_despesas", grupos: ["outras_despesas"], natureza: "despesa", total: "OUTRAS DESPESAS TOTAIS" },
  { code: "outras_receitas", grupos: ["outras_receitas"], natureza: "receita", total: "OUTRAS RECEITAS TOTAIS" },
];

/**
 * Os blocos do modelo customizado "despesas por área" (21/10/2026) — o corte
 * que a exportação usou até 20/10/2026, quando o Connect tinha os doze grupos:
 *
 * - **Custo operacional = CMV + mão de obra + comerciais**: são as parcelas da
 *   margem de contribuição do Connect, e o modelo também faz a margem como
 *   receita bruta menos o custo operacional. A margem do arquivo é a da tela.
 * - **Custo administrativo = pessoal + diretoria + administrativas +
 *   financeiras**: o "total de despesas fixas" do Connect.
 * - **Outras despesas = investimentos + outras despesas**: no modelo, compra de
 *   ativo e investimento já moram em outras despesas, abaixo do EBITDA.
 *
 * Não há bloco de financiamentos: o modelo por área não tem esse grupo.
 */
export const BLOCOS_POR_AREA: BlocoDoModelo[] = [
  { code: "receita", grupos: ["receita_bruta"], natureza: "receita", total: "RECEITA BRUTA" },
  { code: "impostos", grupos: ["impostos"], natureza: "despesa", total: "IMPOSTOS SOBRE RECEITA BRUTA" },
  { code: "custo_operacional", grupos: ["cmv", "mao_de_obra", "comerciais"], natureza: "despesa", total: "CUSTO OPERACIONAL TOTAL" },
  {
    code: "custo_administrativo",
    grupos: ["pessoal", "diretoria", "administrativas", "financeiras"],
    natureza: "despesa",
    total: "CUSTO ADMINISTRATIVO TOTAL",
  },
  { code: "outras_despesas", grupos: ["investimentos", "outras_despesas"], natureza: "despesa", total: "OUTRAS DESPESAS TOTAIS" },
  { code: "outras_receitas", grupos: ["outras_receitas"], natureza: "receita", total: "OUTRAS RECEITAS TOTAIS" },
];

/** Os blocos do arquivo para o modelo do DRE da empresa. */
export function blocosDoModelo(modelo: ModeloDoDre): BlocoDoModelo[] {
  return modelo.codigo === "por_area" ? BLOCOS_POR_AREA : BLOCOS_DO_MODELO;
}

/** As linhas do modelo que não são categoria, com o rótulo de lá. */
const ROTULO = {
  impostos_pct: "IMPOSTOS SOBRE RECEITA BRUTA %",
  receita_liquida: "RECEITA LÍQUIDA",
  custo_operacional_pct: "CUSTO OPERACIONAL SOBRE RECEITA BRUTA %",
  margem_contribuicao: "MARGEM DE CONTRIBUIÇÃO",
  margem_contribuicao_pct: "MARGEM DE CONTRIBUIÇÃO SOBRE RECEITA BRUTA %",
  custo_administrativo_pct: "CUSTO ADMINISTRATIVO SOBRE RECEITA BRUTA %",
  financiamentos_pct: "DESPESAS TOTAIS FINANCIAMENTOS, EMPRÉSTIMOS e PARCELAMENTOS %",
  gerador_de_caixa: "GERADOR DE CAIXA (EBITDA)",
  // "Líquida" no rótulo e divisão pela BRUTA na fórmula: está assim no modelo,
  // e fica assim para o arquivo ler igual ao que o cliente já recebe.
  gerador_de_caixa_pct: "GERADOR DE CAIXA (EBITDA) SOBRE RECEITA LÍQUIDA %",
  outras_despesas_pct: "OUTRAS DESPESAS SOBRE RECEITA BRUTA %",
  outras_receitas_pct: "OUTRAS RECEITAS SOBRE RECEITA BRUTA %",
  resultado_liquido: "RESULTADO LÍQUIDO OPERACIONAL",
  resultado_liquido_pct: "RESULTADO LÍQUIDO OPERACIONAL SOBRE RECEITA BRUTA %",
} as const;

export const ROTULO_FORA_SEM_GRUPO = "Fora do DRE — sem grupo";
export const ROTULO_FORA_TRANSFERENCIA = "Fora do DRE — transferência entre contas";
/**
 * Categoria que a empresa mandou desconsiderar (13/10/2026). Como a
 * transferência, fica fora das linhas de propósito e não liga o aviso de "sem
 * grupo" — mas aparece na conferência, com o motivo, para quem recebe o
 * arquivo saber que o valor existiu e foi tirado.
 */
export const ROTULO_FORA_DESCONSIDERADA = "Fora do DRE — desconsiderada";

/**
 * O aviso embaixo da DRE quando algo ficou sem grupo. O modelo não tem onde pôr
 * dinheiro sem categoria — o `SUMIF` simplesmente não o acha —, e a tela do
 * Connect existe para isso não sumir calado; o arquivo avisa e manda para a
 * conferência, em vez de inventar uma linha que o modelo não tem.
 */
export const AVISO_DE_SEM_GRUPO =
  "Há lançamentos sem grupo no DRE, fora das linhas acima — ver a aba Conferência.";

/** "DRE Padaria Pão Quente 10-2026.xlsx": o nome da empresa sem o que o Windows recusa. */
export function nomeDoArquivoDaDre(empresa: string, periodo: string): string {
  const limpo = [...empresa.normalize("NFC").replace(/\p{Cc}/gu, " ").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()]
    .slice(0, 120)
    .join("")
    .replace(/[. ]+$/, "");
  return `DRE ${limpo || "empresa"} ${periodo}.xlsx`;
}

// ─── Entrada e saída ────────────────────────────────────────────────────────

/** Uma coluna de valores: um mês, com os lançamentos dele. */
export type ColunaDeEntrada = { rotulo: string; lancamentos: LancamentoDoDre[] };

export type EntradaDoModelo = {
  /** Na ordem em que saem na planilha. Pelo menos uma. */
  colunas: ColunaDeEntrada[];
  mapeamento: Mapeamento;
  /**
   * O rótulo da coluna de total do ano ("Total 2026"), ou `null` para não ter —
   * a exportação de um mês só. No modelo cada coluna **é** um ano inteiro.
   */
  colunaDeTotal: string | null;
  /** A opção dos impostos da tela — o EBITDA do arquivo é o da tela. */
  opcoes?: OpcoesDoDre;
};

export type CelulaDoModelo = {
  /** Centavos, no sinal do modelo (despesa positiva). `null` em percentual e no separador. */
  centavos: number | null;
  /** Fração de 0 a 1 nas de percentual; `null` com receita bruta zero — a célula fica vazia. */
  fracao: number | null;
  /** A fórmula do Excel, sem o "=". `null` quando a célula é um valor. */
  formula: string | null;
};

export type LinhaDoModelo = {
  /** O número da linha na planilha — é para ele que as fórmulas apontam. */
  numero: number;
  /** "categoria", "separador" ou o código do total/percentual/resultado. */
  codigo: string;
  tipo: "categoria" | "total" | "percentual" | "resultado" | "percentual_resultado" | "separador";
  rotulo: string;
  bloco: CodigoDoBloco | null;
  /** A cor dos valores no modelo: receita em azul, despesa em vermelho, resultado em preto. */
  natureza: "receita" | "despesa" | "resultado";
  /** Casas do percentual, como no modelo: 2 nos dois primeiros, 0 no resto. */
  casas: 0 | 2 | null;
  celulas: CelulaDoModelo[];
};

/** Uma linha da aba de conferência — a `Planilha1` do modelo. */
export type LinhaDaConferencia = {
  categoria: string;
  origem: "recebimento" | "pagamento";
  /** No sinal do modelo, somado em todas as colunas. */
  centavos: number;
  /** A linha de total em que a categoria entrou, ou o motivo de ter ficado fora. */
  destino: string;
  fora: boolean;
};

export type PlanilhaDoModelo = {
  /** Os rótulos das colunas de valor: os meses e, se houver, o total. */
  cabecalho: string[];
  /** A última coluna é o total do ano. */
  temColunaDeTotal: boolean;
  linhas: LinhaDoModelo[];
  /** A linha da RECEITA BRUTA — o painel congelado do modelo vai até ela. */
  linhaDaReceitaBruta: number;
  conferencia: LinhaDaConferencia[];
  /** Houve lançamento sem grupo — fora de todas as linhas, e a planilha avisa. */
  temSemGrupo: boolean;
};

/** Linha 1 é o título, linha 2 o cabeçalho; as do DRE começam na 3, como no modelo. */
export const PRIMEIRA_LINHA_DO_DRE = 3;

/** A letra da coluna de valor `i` — a primeira é B, porque A é o rótulo. */
export function letraDaColuna(i: number): string {
  // Doze meses e o total chegam à N; com folga até a Z.
  if (i < 0 || i > 24) throw new Error(`Coluna fora do modelo: ${i}`);
  return String.fromCharCode(66 + i);
}

// ─── A montagem ─────────────────────────────────────────────────────────────

type Acumulado = {
  nome: string;
  grupo: string;
  origem: "recebimento" | "pagamento";
  /** Centavos no sinal do Connect, uma posição por coluna de entrada. */
  porColuna: number[];
};

/** Nome que aparece na linha: o primeiro com que a categoria chegou. */
function nomeDe(l: LancamentoDoDre): string {
  return l.categoria?.trim() || SEM_CATEGORIA;
}

export function montarDreNoModeloDoBpo(entrada: EntradaDoModelo): PlanilhaDoModelo {
  const { colunas, mapeamento, colunaDeTotal, opcoes = OPCOES_PADRAO } = entrada;
  if (colunas.length === 0) throw new Error("A DRE no modelo do BPO precisa de pelo menos uma coluna.");

  const modelo = modeloDas(opcoes);
  const blocos = blocosDoModelo(modelo);
  const BLOCO_DO_GRUPO = new Map<string, BlocoDoModelo>();
  for (const b of blocos) for (const g of b.grupos) BLOCO_DO_GRUPO.set(g, b);
  // Dentro do bloco de vários grupos (o por área), as categorias saem na ordem
  // dos grupos do modelo: CMV, mão de obra, comerciais.
  const ORDEM_DO_GRUPO = new Map(modelo.grupos.map((g, i) => [g.code, i]));

  const nMeses = colunas.length;
  const comTotal = colunaDeTotal !== null;
  const nColunas = nMeses + (comTotal ? 1 : 0);
  const ultimaMensal = letraDaColuna(nMeses - 1);

  // ─── 1. Cada lançamento no seu lugar, pela regra da tela ─────────────────
  const porBloco = new Map<CodigoDoBloco, Map<string, Acumulado>>();
  const foraSemGrupo = new Map<string, Acumulado>();
  const foraTransferencia = new Map<string, Acumulado>();
  const foraDesconsiderada = new Map<string, Acumulado>();

  const acumular = (mapa: Map<string, Acumulado>, chave: string, l: LancamentoDoDre, grupo: string, coluna: number) => {
    let a = mapa.get(chave);
    if (!a) {
      a = { nome: nomeDe(l), grupo, origem: l.origem, porColuna: new Array<number>(nMeses).fill(0) };
      mapa.set(chave, a);
    }
    a.porColuna[coluna]! += l.valorCentavos;
  };

  colunas.forEach((coluna, i) => {
    for (const l of coluna.lancamentos) {
      const grupo = grupoDoLancamento(l, mapeamento);
      const chave = chaveDaCategoria(nomeDe(l));
      if (grupo === TRANSFERENCIA || grupo === DESCONSIDERAR) {
        acumular(grupo === TRANSFERENCIA ? foraTransferencia : foraDesconsiderada, `${l.origem}|${chave}`, l, grupo, i);
        continue;
      }
      const bloco = grupo === null ? undefined : BLOCO_DO_GRUPO.get(grupo);
      // Sem grupo — ou com um grupo que o relatório de caixa não soma — fica
      // fora das linhas, como na tela, e aparece na conferência.
      if (!bloco) {
        acumular(foraSemGrupo, `${l.origem}|${chave}`, l, grupo ?? "", i);
        continue;
      }
      let doBloco = porBloco.get(bloco.code);
      if (!doBloco) porBloco.set(bloco.code, (doBloco = new Map()));
      acumular(doBloco, chave, l, grupo!, i);
    }
  });

  // ─── 2. As linhas, de cima para baixo ────────────────────────────────────
  const linhas: LinhaDoModelo[] = [];
  const porCodigo = new Map<string, LinhaDoModelo>();
  let numero = PRIMEIRA_LINHA_DO_DRE;

  const empurrar = (l: Omit<LinhaDoModelo, "numero">): LinhaDoModelo => {
    const linha = { ...l, numero: numero++ };
    linhas.push(linha);
    if (l.tipo !== "categoria") porCodigo.set(l.codigo, linha);
    return linha;
  };

  const vazia = (): CelulaDoModelo => ({ centavos: null, fracao: null, formula: null });
  const valor = (codigo: string, c: number): number => porCodigo.get(codigo)!.celulas[c]!.centavos ?? 0;
  const ref = (codigo: string, c: number): string => `${letraDaColuna(c)}${porCodigo.get(codigo)!.numero}`;

  const conferenciaDoDre: LinhaDaConferencia[] = [];

  /** As categorias do bloco e a linha de total embaixo delas. */
  const bloco = (b: BlocoDoModelo, codigoDoTotal: string) => {
    const sinal = b.natureza === "despesa" ? -1 : 1;
    const categorias = [...(porBloco.get(b.code)?.values() ?? [])].sort(
      (x, y) =>
        (ORDEM_DO_GRUPO.get(x.grupo) ?? 99) - (ORDEM_DO_GRUPO.get(y.grupo) ?? 99) ||
        x.nome.localeCompare(y.nome, "pt-BR")
    );

    const primeira = numero;
    for (const cat of categorias) {
      // `|| 0`: zero vezes −1 é −0, e o −0 chega ao Excel.
      const noModelo = cat.porColuna.map((v) => v * sinal || 0);
      const linha = empurrar({
        codigo: "categoria",
        tipo: "categoria",
        rotulo: cat.nome,
        bloco: b.code,
        natureza: b.natureza,
        casas: null,
        celulas: noModelo.map((v) => ({ centavos: v, fracao: null, formula: null })),
      });
      if (comTotal) {
        linha.celulas.push({
          centavos: noModelo.reduce((s, v) => s + v, 0),
          fracao: null,
          formula: `SUM(B${linha.numero}:${ultimaMensal}${linha.numero})`,
        });
      }
      conferenciaDoDre.push({
        categoria: cat.nome,
        origem: cat.origem,
        centavos: noModelo.reduce((s, v) => s + v, 0),
        destino: b.total,
        fora: false,
      });
    }
    const ultima = numero - 1;
    const doBloco = linhas.slice(linhas.length - categorias.length);

    empurrar({
      codigo: codigoDoTotal,
      tipo: "total",
      rotulo: b.total,
      bloco: b.code,
      natureza: b.natureza,
      casas: null,
      celulas: Array.from({ length: nColunas }, (_, c) =>
        categorias.length === 0
          ? // Bloco sem categoria com movimento: o total é zero digitado, não
            // uma soma de intervalo vazio.
            { centavos: 0, fracao: null, formula: null }
          : {
              centavos: doBloco.reduce((s, l) => s + (l.celulas[c]!.centavos ?? 0), 0),
              fracao: null,
              formula: `SUM(${letraDaColuna(c)}${primeira}:${letraDaColuna(c)}${ultima})`,
            }
      ),
    });
  };

  /**
   * Percentual sobre a receita bruta. `absoluto` reproduz o
   * `((x/y)^2)^(1/2)` do modelo nas linhas de despesa — que é o `ABS` —, e a
   * divisão simples nas de resultado. Receita bruta zero deixa a célula vazia,
   * como o `IF(B6=0,"",…)` do modelo.
   */
  const percentual = (
    codigo: string,
    rotulo: string,
    de: string,
    absoluto: boolean,
    casas: 0 | 2,
    tipo: "percentual" | "percentual_resultado",
    natureza: LinhaDoModelo["natureza"],
    bloco: CodigoDoBloco | null
  ) => {
    empurrar({
      codigo,
      tipo,
      rotulo,
      bloco,
      natureza,
      casas,
      celulas: Array.from({ length: nColunas }, (_, c) => {
        const rb = valor("receita_bruta", c);
        const x = valor(de, c);
        const conta = `${ref(de, c)}/${ref("receita_bruta", c)}`;
        return {
          centavos: null,
          fracao: rb === 0 ? null : absoluto ? Math.abs(x / rb) : x / rb,
          formula: `IF(${ref("receita_bruta", c)}=0,"",${absoluto ? `ABS(${conta})` : conta})`,
        };
      }),
    });
  };

  /** Um resultado: soma e subtração de linhas que já existem, como no modelo. */
  const resultado = (codigo: string, rotulo: string, termos: [sinal: 1 | -1, codigo: string][]) => {
    empurrar({
      codigo,
      tipo: "resultado",
      rotulo,
      bloco: null,
      natureza: "resultado",
      casas: null,
      celulas: Array.from({ length: nColunas }, (_, c) => ({
        centavos: termos.reduce((s, [sinal, cod]) => s + sinal * valor(cod, c), 0),
        fracao: null,
        formula: termos.map(([sinal, cod], i) => `${i === 0 ? "" : sinal === 1 ? "+" : "-"}${ref(cod, c)}`).join(""),
      })),
    });
  };

  const doCodigo = (code: CodigoDoBloco) => blocos.find((b) => b.code === code);
  const receita = doCodigo("receita")!;
  const impostos = doCodigo("impostos")!;
  const operacional = doCodigo("custo_operacional")!;
  const administrativo = doCodigo("custo_administrativo")!;
  const financiamentos = doCodigo("financiamentos");
  const outrasDespesas = doCodigo("outras_despesas")!;
  const outrasReceitas = doCodigo("outras_receitas")!;

  bloco(receita, "receita_bruta");

  bloco(impostos, "impostos");
  percentual("impostos_pct", ROTULO.impostos_pct, "impostos", true, 2, "percentual", "despesa", "impostos");
  resultado("receita_liquida", ROTULO.receita_liquida, [[1, "receita_bruta"], [-1, "impostos"]]);
  // A faixa preta e fina que o modelo põe entre a receita líquida e os custos.
  empurrar({
    codigo: "separador",
    tipo: "separador",
    rotulo: "",
    bloco: null,
    natureza: "resultado",
    casas: null,
    celulas: Array.from({ length: nColunas }, vazia),
  });

  bloco(operacional, "custo_operacional");
  percentual("custo_operacional_pct", ROTULO.custo_operacional_pct, "custo_operacional", true, 2, "percentual", "despesa", "custo_operacional");
  // A margem parte da receita BRUTA, como na tela e no modelo.
  resultado("margem_contribuicao", ROTULO.margem_contribuicao, [[1, "receita_bruta"], [-1, "custo_operacional"]]);
  percentual("margem_contribuicao_pct", ROTULO.margem_contribuicao_pct, "margem_contribuicao", false, 0, "percentual_resultado", "resultado", null);

  bloco(administrativo, "custo_administrativo");
  percentual("custo_administrativo_pct", ROTULO.custo_administrativo_pct, "custo_administrativo", true, 0, "percentual", "despesa", "custo_administrativo");

  if (financiamentos) {
    bloco(financiamentos, "financiamentos");
    percentual("financiamentos_pct", ROTULO.financiamentos_pct, "financiamentos", true, 0, "percentual", "despesa", "financiamentos");
  }
  // ─── Os impostos no EBITDA do arquivo ─────────────────────────────────────
  //
  // No padrão, o arquivo segue a tela: desconta os impostos como o modelo
  // (`B7+B16+B53+B93+B107`), ou não, na visão "fora do resultado". No por área,
  // o arquivo sempre descontou (`B6-B8-B32-B60`), embora a tela não desconte: o
  // EBITDA e o resultado daqui ficam abaixo dos da tela exatamente pelo valor
  // dos impostos. Mantido como era.
  const impostosNoEbitda = modelo.impostos === "fora" || opcoes.impostosNoEbitda;
  resultado("gerador_de_caixa", ROTULO.gerador_de_caixa, [
    [1, "receita_bruta"],
    ...(impostosNoEbitda ? ([[-1, "impostos"]] as [1 | -1, string][]) : []),
    [-1, "custo_operacional"],
    [-1, "custo_administrativo"],
    ...(financiamentos ? ([[-1, "financiamentos"]] as [1 | -1, string][]) : []),
  ]);
  percentual("gerador_de_caixa_pct", ROTULO.gerador_de_caixa_pct, "gerador_de_caixa", false, 0, "percentual_resultado", "resultado", null);

  bloco(outrasDespesas, "outras_despesas");
  percentual("outras_despesas_pct", ROTULO.outras_despesas_pct, "outras_despesas", true, 0, "percentual", "despesa", "outras_despesas");

  bloco(outrasReceitas, "outras_receitas");
  percentual("outras_receitas_pct", ROTULO.outras_receitas_pct, "outras_receitas", false, 0, "percentual", "receita", "outras_receitas");

  resultado("resultado_liquido", ROTULO.resultado_liquido, [
    [1, "gerador_de_caixa"],
    [-1, "outras_despesas"],
    [1, "outras_receitas"],
  ]);
  percentual("resultado_liquido_pct", ROTULO.resultado_liquido_pct, "resultado_liquido", false, 0, "percentual_resultado", "resultado", null);

  // ─── 3. A conferência: o que entrou onde, e o que ficou de fora ──────────
  const fora = (mapa: Map<string, Acumulado>, destino: string): LinhaDaConferencia[] =>
    [...mapa.values()]
      .map((a) => ({
        categoria: a.nome,
        origem: a.origem,
        // Pagamento positivo, como na coluna "Valor Pago" do modelo.
        centavos: a.porColuna.reduce((s, v) => s + v, 0) * (a.origem === "pagamento" ? -1 : 1) || 0,
        destino,
        fora: true,
      }))
      .sort((x, y) => x.categoria.localeCompare(y.categoria, "pt-BR"));

  return {
    cabecalho: [...colunas.map((c) => c.rotulo), ...(comTotal ? [colunaDeTotal] : [])],
    temColunaDeTotal: comTotal,
    linhas,
    linhaDaReceitaBruta: porCodigo.get("receita_bruta")!.numero,
    // O que ficou de fora vem primeiro: é o que a conferência existe para achar.
    conferencia: [
      ...fora(foraSemGrupo, ROTULO_FORA_SEM_GRUPO),
      ...fora(foraTransferencia, ROTULO_FORA_TRANSFERENCIA),
      ...fora(foraDesconsiderada, ROTULO_FORA_DESCONSIDERADA),
      ...conferenciaDoDre,
    ],
    temSemGrupo: foraSemGrupo.size > 0,
  };
}
