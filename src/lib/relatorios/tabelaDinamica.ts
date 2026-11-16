// A tabela dinâmica do financeiro (20/10/2026 — "tabelas dinâmicas como o
// Omie, para visualizar e exportar"). Funções puras: as bases, as dimensões e
// as medidas, a leitura da configuração do endereço, as visões prontas e a
// montagem da tabela. Os fatos saem do banco em `tabelaDinamicaServidor.ts`.
//
// ─── Construída aqui, e não uma biblioteca ───────────────────────────────────
//
// A conta é feita no servidor: o acervo da produção é grande (centenas de
// empresas), a permissão por setor é de lá, e a tela recebe só a tabela já
// somada. Linhas (até três níveis), uma coluna, uma medida e os filtros cobrem
// o que o setor faz com a tabela dinâmica do Omie; para o resto, a exportação
// leva os dados numa Tabela do Excel.
//
// ─── Campos e áreas (16/11/2026, melhoria-719) ───────────────────────────────
//
// A configuração deixou de ser dez seletores e um "Aplicar": a tela mostra os
// campos da base e as áreas Linhas, Colunas e Valores, como no Excel, e cada
// mudança já troca a tabela. As regras de colocar, tirar e reordenar um campo
// (`colocarNasLinhas`, `colocarNaColuna`, `tirarDaTabela`, `moverLinha`,
// `trocarBase`) ficam aqui, puras, para a tela só desenhar. Os parâmetros do
// endereço são os mesmos; o terceiro nível é mais um campo em `linhas`.

import { formatarCompetencia } from "@/lib/format";

/** O módulo da tela (`/tabela-dinamica`). */
export const MODULO_DA_TABELA_DINAMICA = "bpo_tabela_dinamica";

export const BASES = ["contas", "baixas"] as const;
export type Base = (typeof BASES)[number];

export const ROTULO_DA_BASE: Record<Base, string> = {
  contas: "Contas (títulos)",
  baixas: "Baixas (caixa realizado)",
};

/** O nome curto, o do seletor da tela; o comprido segue na exportação e na dica. */
export const NOME_DA_BASE: Record<Base, string> = { contas: "Contas", baixas: "Baixas" };

export type Dimensao =
  | "empresa"
  | "tipo"
  | "categoria"
  | "grupo"
  | "centro"
  | "projeto"
  | "contraparte"
  | "situacao"
  | "aprovacao"
  | "competencia"
  | "vencimento"
  | "previsao"
  | "quitacao"
  | "pagamento"
  | "parte";

type DefinicaoDaDimensao = {
  rotulo: string;
  /** O rótulo do valor vazio. */
  vazio: string;
  /** Mês "AAAA-MM": ordena no tempo e mostra "Set/26". */
  tempo?: boolean;
  bases: readonly Base[];
};

export const DIMENSOES: Record<Dimensao, DefinicaoDaDimensao> = {
  empresa: { rotulo: "Empresa", vazio: "(sem empresa)", bases: BASES },
  tipo: { rotulo: "Tipo", vazio: "(sem tipo)", bases: BASES },
  categoria: { rotulo: "Categoria", vazio: "(sem categoria)", bases: BASES },
  grupo: { rotulo: "Grupo do plano de contas", vazio: "(sem grupo)", bases: BASES },
  centro: { rotulo: "Centro de custo", vazio: "(sem centro de custo)", bases: BASES },
  projeto: { rotulo: "Projeto", vazio: "(sem projeto)", bases: BASES },
  contraparte: { rotulo: "Fornecedor ou cliente", vazio: "(sem contraparte)", bases: BASES },
  situacao: { rotulo: "Situação", vazio: "(sem situação)", bases: ["contas"] },
  aprovacao: { rotulo: "Aprovação", vazio: "Não requer", bases: ["contas"] },
  competencia: { rotulo: "Competência", vazio: "(sem competência)", tempo: true, bases: BASES },
  vencimento: { rotulo: "Mês de vencimento", vazio: "(sem vencimento)", tempo: true, bases: ["contas"] },
  previsao: { rotulo: "Mês previsto", vazio: "(sem data)", tempo: true, bases: ["contas"] },
  quitacao: { rotulo: "Mês da quitação", vazio: "Em aberto", tempo: true, bases: ["contas"] },
  pagamento: { rotulo: "Mês do pagamento", vazio: "(sem data)", tempo: true, bases: ["baixas"] },
  parte: { rotulo: "Parte da baixa", vazio: "(sem parte)", bases: ["baixas"] },
};

export type Medida = "valor" | "baixado" | "saldo" | "quantidade" | "liquido";

type DefinicaoDaMedida = {
  rotulo: string;
  /** "reais" soma centavos; "contagem" conta chaves distintas (uma conta rateada conta uma vez). */
  tipo: "reais" | "contagem";
  bases: readonly Base[];
};

export const MEDIDAS: Record<Medida, DefinicaoDaMedida> = {
  valor: { rotulo: "Valor", tipo: "reais", bases: BASES },
  baixado: { rotulo: "Pago ou recebido", tipo: "reais", bases: ["contas"] },
  saldo: { rotulo: "Saldo em aberto", tipo: "reais", bases: ["contas"] },
  liquido: { rotulo: "Entradas menos saídas", tipo: "reais", bases: ["baixas"] },
  quantidade: { rotulo: "Quantidade", tipo: "contagem", bases: BASES },
};

/** Um fato: uma conta (ou uma parte do rateio dela) ou um movimento de baixa. */
export type Fato = {
  /** A conta ou a baixa — a quantidade conta chaves distintas. */
  chave: string;
  dims: Partial<Record<Dimensao, string | null>>;
  medidas: Partial<Record<Medida, number>>;
};

export type Situacao = "todas" | "abertas" | "vencidas" | "quitadas";
export type Tipo = "ambos" | "PAGAR" | "RECEBER";

/** Quantos campos cabem nas linhas: o grupo, o detalhe e o detalhe do detalhe. */
export const MAXIMO_DE_NIVEIS = 3;

export type Configuracao = {
  base: Base;
  /** De um a `MAXIMO_DE_NIVEIS` níveis. */
  linhas: Dimensao[];
  coluna: Dimensao | null;
  medida: Medida;
  filtros: {
    tipo: Tipo;
    /** "AAAA-MM" ou nada (sem limite). */
    de: string | null;
    ate: string | null;
    /** Na base de contas, o mês que o período recorta. */
    periodoPor: "competencia" | "vencimento";
    situacao: Situacao;
  };
};

const valeNaBase = (d: string | null | undefined, base: Base): d is Dimensao =>
  !!d && d in DIMENSOES && DIMENSOES[d as Dimensao].bases.includes(base);
const mes = (v: string | null | undefined) => (v && /^\d{4}-\d{2}$/.test(v) ? v : null);

/**
 * A configuração a partir do endereço, com os padrões da base. Dimensão ou
 * medida que não vale na base cai no padrão, em vez de dar tela vazia.
 */
export function lerConfiguracao(p: Record<string, string | undefined>, hojeKey: string): Configuracao {
  const base: Base = p.base === "baixas" ? "baixas" : "contas";
  const linhas = (p.linhas ?? "")
    .split(",")
    .filter((d, i, todas) => valeNaBase(d, base) && todas.indexOf(d) === i)
    .slice(0, MAXIMO_DE_NIVEIS) as Dimensao[];
  const coluna = valeNaBase(p.coluna, base) && !linhas.includes(p.coluna as Dimensao) ? (p.coluna as Dimensao) : null;
  const medida = p.medida && p.medida in MEDIDAS && MEDIDAS[p.medida as Medida].bases.includes(base) ? (p.medida as Medida) : "valor";
  const atual = hojeKey.slice(0, 7);
  const semPeriodo = p.periodo === "todos";
  return {
    base,
    linhas: linhas.length > 0 ? linhas : ["categoria"],
    coluna: p.coluna === "nenhuma" ? null : coluna ?? (p.coluna === undefined ? (base === "baixas" ? "pagamento" : "competencia") : null),
    medida,
    filtros: {
      tipo: p.tipo === "PAGAR" || p.tipo === "RECEBER" ? p.tipo : "ambos",
      de: semPeriodo ? null : mes(p.de) ?? (p.de === undefined ? somarMesesSimples(atual, -5) : null),
      ate: semPeriodo ? null : mes(p.ate) ?? (p.ate === undefined ? atual : null),
      periodoPor: p.periodoPor === "vencimento" ? "vencimento" : "competencia",
      situacao: p.situacao === "abertas" || p.situacao === "vencidas" || p.situacao === "quitadas" ? p.situacao : "todas",
    },
  };
}

function somarMesesSimples(comp: string, n: number): string {
  const [a, m] = comp.split("-").map(Number) as [number, number];
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** A configuração de volta ao endereço — o que os links, a tela e a exportação usam. */
export function paramsDaConfiguracao(c: Configuracao, extra: Record<string, string | undefined> = {}): URLSearchParams {
  const q = new URLSearchParams();
  q.set("base", c.base);
  q.set("linhas", c.linhas.join(","));
  q.set("coluna", c.coluna ?? "nenhuma");
  q.set("medida", c.medida);
  if (c.filtros.tipo !== "ambos") q.set("tipo", c.filtros.tipo);
  if (!c.filtros.de && !c.filtros.ate) q.set("periodo", "todos");
  else {
    // A ponta sem limite vai vazia (`de=`), como o formulário mandava: sem o
    // parâmetro, a leitura poria o padrão de seis meses no lugar, e a tela (que
    // desde 16/11/2026 navega por aqui) e a exportação recortariam outro período.
    q.set("de", c.filtros.de ?? "");
    q.set("ate", c.filtros.ate ?? "");
  }
  if (c.base === "contas" && c.filtros.periodoPor === "vencimento") q.set("periodoPor", "vencimento");
  if (c.base === "contas" && c.filtros.situacao !== "todas") q.set("situacao", c.filtros.situacao);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return q;
}

// ─── Campos e áreas ──────────────────────────────────────────────────────────

/** Os campos que a base tem, na ordem em que a tela os lista. */
export function dimensoesDaBase(base: Base): Dimensao[] {
  return (Object.keys(DIMENSOES) as Dimensao[]).filter((d) => DIMENSOES[d].bases.includes(base));
}

export function medidasDaBase(base: Base): Medida[] {
  return (Object.keys(MEDIDAS) as Medida[]).filter((m) => MEDIDAS[m].bases.includes(base));
}

export type Area = "linhas" | "coluna";

/** Em que área o campo está, ou `null` para o que está fora da tabela. */
export function areaDoCampo(c: Pick<Configuracao, "linhas" | "coluna">, d: Dimensao): Area | null {
  return c.linhas.includes(d) ? "linhas" : c.coluna === d ? "coluna" : null;
}

/** O campo pode entrar nas linhas: ainda não está nelas e sobra um nível. */
export function cabeNasLinhas(c: Pick<Configuracao, "linhas">, d: Dimensao): boolean {
  return !c.linhas.includes(d) && c.linhas.length < MAXIMO_DE_NIVEIS;
}

/**
 * O campo pode ir para a coluna: a tabela precisa de um campo nas linhas, então
 * o único das linhas só vai se houver um na coluna para trocar de lugar com ele.
 */
export function cabeNaColuna(c: Pick<Configuracao, "linhas" | "coluna">, d: Dimensao): boolean {
  if (c.coluna === d) return false;
  return !c.linhas.includes(d) || c.linhas.length > 1 || c.coluna !== null;
}

/** As linhas precisam de um campo: o último não sai. */
export function podeTirar(c: Pick<Configuracao, "linhas" | "coluna">, d: Dimensao): boolean {
  return c.coluna === d || (c.linhas.includes(d) && c.linhas.length > 1);
}

/** O campo entra como o último nível das linhas; se estava na coluna, sai de lá. */
export function colocarNasLinhas(c: Configuracao, d: Dimensao): Configuracao {
  if (!valeNaBase(d, c.base) || !cabeNasLinhas(c, d)) return c;
  return { ...c, linhas: [...c.linhas, d], coluna: c.coluna === d ? null : c.coluna };
}

/**
 * O campo vira a coluna (uma só: o que estava lá sai). Vindo das linhas, sai
 * delas — e, se era o único, o que estava na coluna toma o lugar dele.
 */
export function colocarNaColuna(c: Configuracao, d: Dimensao): Configuracao {
  if (!valeNaBase(d, c.base) || !cabeNaColuna(c, d)) return c;
  const linhas = c.linhas.filter((l) => l !== d);
  return { ...c, linhas: linhas.length > 0 ? linhas : [c.coluna!], coluna: d };
}

/** Tira o campo de onde ele estiver. */
export function tirarDaTabela(c: Configuracao, d: Dimensao): Configuracao {
  if (!podeTirar(c, d)) return c;
  return c.coluna === d ? { ...c, coluna: null } : { ...c, linhas: c.linhas.filter((l) => l !== d) };
}

/** Sobe (`-1`) ou desce (`1`) um nível das linhas; na ponta, fica como está. */
export function moverLinha(c: Configuracao, d: Dimensao, passo: -1 | 1): Configuracao {
  const de = c.linhas.indexOf(d);
  const para = de + passo;
  if (de === -1 || para < 0 || para >= c.linhas.length) return c;
  const linhas = [...c.linhas];
  [linhas[de], linhas[para]] = [linhas[para]!, linhas[de]!];
  return { ...c, linhas };
}

/**
 * A mesma tabela na outra base. O que não existe nela volta ao padrão dela —
 * o campo some das linhas, a coluna vira o mês da base, a medida vira o valor —
 * e os filtros que só as contas têm voltam ao começo.
 */
export function trocarBase(c: Configuracao, base: Base): Configuracao {
  if (base === c.base) return c;
  const linhas = c.linhas.filter((d) => valeNaBase(d, base));
  const emLinhas = linhas.length > 0 ? linhas : (["categoria"] as Dimensao[]);
  const mesDaBase: Dimensao = base === "baixas" ? "pagamento" : "competencia";
  const coluna = c.coluna === null || valeNaBase(c.coluna, base) ? c.coluna : mesDaBase;
  return {
    base,
    linhas: emLinhas,
    coluna: coluna && emLinhas.includes(coluna) ? null : coluna,
    medida: MEDIDAS[c.medida].bases.includes(base) ? c.medida : "valor",
    filtros: base === "contas" ? c.filtros : { ...c.filtros, periodoPor: "competencia", situacao: "todas" },
  };
}

// ─── Visões prontas ──────────────────────────────────────────────────────────

export type VisaoPronta = { id: string; rotulo: string; descricao: string; params: Record<string, string> };

/** As visões que o setor mais usa no Omie, prontas para abrir e ajustar. */
export const VISOES_PRONTAS: readonly VisaoPronta[] = [
  {
    id: "despesas-por-categoria",
    rotulo: "Despesas por categoria",
    descricao: "Contas a pagar por grupo e categoria, mês a mês pela competência.",
    params: { base: "contas", tipo: "PAGAR", linhas: "grupo,categoria", coluna: "competencia", medida: "valor" },
  },
  {
    id: "receitas-por-categoria",
    rotulo: "Receitas por categoria",
    descricao: "Contas a receber por grupo e categoria, mês a mês pela competência.",
    params: { base: "contas", tipo: "RECEBER", linhas: "grupo,categoria", coluna: "competencia", medida: "valor" },
  },
  {
    id: "a-pagar-por-fornecedor",
    rotulo: "A pagar por fornecedor",
    descricao: "O saldo em aberto de cada fornecedor, pelo mês de vencimento.",
    params: { base: "contas", tipo: "PAGAR", situacao: "abertas", periodo: "todos", linhas: "contraparte", coluna: "vencimento", medida: "saldo" },
  },
  {
    id: "a-receber-por-cliente",
    rotulo: "A receber por cliente",
    descricao: "O saldo em aberto de cada cliente, pelo mês de vencimento.",
    params: { base: "contas", tipo: "RECEBER", situacao: "abertas", periodo: "todos", linhas: "contraparte", coluna: "vencimento", medida: "saldo" },
  },
  {
    id: "caixa-por-categoria",
    rotulo: "Caixa por categoria",
    descricao: "O que entrou e saiu de verdade, por categoria e mês do pagamento.",
    params: { base: "baixas", linhas: "tipo,categoria", coluna: "pagamento", medida: "valor" },
  },
  {
    id: "resultado-por-centro",
    rotulo: "Resultado por centro de custo",
    descricao: "Receitas e despesas de cada centro, pela competência.",
    params: { base: "contas", linhas: "centro,tipo", coluna: "competencia", medida: "valor" },
  },
];

// ─── A montagem ──────────────────────────────────────────────────────────────

export type LinhaDaTabela = {
  chave: string;
  rotulo: string;
  valores: number[];
  total: number;
  filhas?: LinhaDaTabela[];
};

export type Tabela = {
  colunas: { chave: string; rotulo: string }[];
  linhas: LinhaDaTabela[];
  totalPorColuna: number[];
  total: number;
  /** Linhas do primeiro nível que passaram do teto e foram somadas em "Outros". */
  linhasAgrupadas: number;
  colunasAgrupadas: number;
};

/** Teto do que a tela desenha: o resto vai para "Outros", e a exportação leva tudo. */
export const MAXIMO_DE_LINHAS = 300;
export const MAXIMO_DE_COLUNAS = 36;
const OUTROS = "\u0000outros";
const TOTAL = "\u0000total";

export function rotuloDoValor(d: Dimensao, chave: string | null | undefined): string {
  if (chave === OUTROS) return "Outros";
  if (!chave) return DIMENSOES[d].vazio;
  return DIMENSOES[d].tempo ? formatarCompetencia(chave) : chave;
}

/** Soma de centavos, ou contagem de chaves distintas — o que a medida pede. */
class Acumulador {
  private soma = 0;
  private chaves: Set<string> | null;
  constructor(contagem: boolean) {
    this.chaves = contagem ? new Set() : null;
  }
  somar(f: Fato, medida: Medida) {
    if (this.chaves) this.chaves.add(f.chave);
    else this.soma += f.medidas[medida] ?? 0;
  }
  valor() {
    return this.chaves ? this.chaves.size : this.soma;
  }
}

function ordenar(d: Dimensao, chaves: string[], totais: Map<string, number>): string[] {
  const vazioPorUltimo = (a: string, b: string) => Number(a === "") - Number(b === "");
  if (DIMENSOES[d].tempo) return [...chaves].sort((a, b) => vazioPorUltimo(a, b) || a.localeCompare(b));
  return [...chaves].sort(
    (a, b) => vazioPorUltimo(a, b) || Math.abs(totais.get(b) ?? 0) - Math.abs(totais.get(a) ?? 0) || a.localeCompare(b, "pt-BR")
  );
}

/**
 * A tabela: as linhas (de um a três níveis, cada um dentro do anterior), as
 * colunas, os totais. Cada célula, cada subtotal e cada total é acumulado à
 * parte — na contagem, somar as células contaria duas vezes a conta que
 * aparece em duas. O teto de linhas vale para o primeiro nível, como antes.
 */
export function montarTabela(fatos: readonly Fato[], c: Pick<Configuracao, "linhas" | "coluna" | "medida">): Tabela {
  const contagem = MEDIDAS[c.medida].tipo === "contagem";
  const d1 = c.linhas[0]!;
  const chaveDe = (f: Fato, d: Dimensao) => f.dims[d] ?? "";

  // As colunas e o primeiro nível passam pelo teto antes de acumular.
  const totaisDe = (d: Dimensao) => {
    const m = new Map<string, number>();
    for (const f of fatos) m.set(chaveDe(f, d), (m.get(chaveDe(f, d)) ?? 0) + (contagem ? 1 : f.medidas[c.medida] ?? 0));
    return m;
  };
  const totaisDaColuna = c.coluna ? totaisDe(c.coluna) : new Map([[TOTAL, 0]]);
  let colunas = c.coluna ? ordenar(c.coluna, [...totaisDaColuna.keys()], totaisDaColuna) : [TOTAL];
  let colunasAgrupadas = 0;
  if (colunas.length > MAXIMO_DE_COLUNAS) {
    colunasAgrupadas = colunas.length - (MAXIMO_DE_COLUNAS - 1);
    colunas = [...colunas.slice(0, MAXIMO_DE_COLUNAS - 1), OUTROS];
  }
  const indiceDaColuna = new Map(colunas.map((k, i) => [k, i]));
  const colunaDe = (f: Fato) => (c.coluna ? indiceDaColuna.get(chaveDe(f, c.coluna)) ?? indiceDaColuna.get(OUTROS)! : 0);

  const totaisDaLinha = totaisDe(d1);
  let primeiras = ordenar(d1, [...totaisDaLinha.keys()], totaisDaLinha);
  let linhasAgrupadas = 0;
  if (primeiras.length > MAXIMO_DE_LINHAS) {
    linhasAgrupadas = primeiras.length - (MAXIMO_DE_LINHAS - 1);
    primeiras = [...primeiras.slice(0, MAXIMO_DE_LINHAS - 1), OUTROS];
  }
  const naTela = new Set(primeiras);
  const linhaDe = (f: Fato) => (naTela.has(chaveDe(f, d1)) ? chaveDe(f, d1) : OUTROS);

  // A célula só nasce quando um fato cai nela (16/11/2026, melhoria-719): com o
  // terceiro nível são mais nós, e a maioria deles só tem valor em uma ou duas
  // colunas — criar as 36 de cada um multiplicava a memória por nada.
  type No = { celulas: (Acumulador | undefined)[]; total: Acumulador; filhas: Map<string, No> };
  const novo = (): No => ({ celulas: new Array<Acumulador | undefined>(colunas.length).fill(undefined), total: new Acumulador(contagem), filhas: new Map() });
  const raiz = new Map<string, No>();
  const porColuna = colunas.map(() => new Acumulador(contagem));
  const geral = new Acumulador(contagem);

  for (const f of fatos) {
    const ci = colunaDe(f);
    // Um nó por nível, cada um dentro do anterior: o fato soma em todos.
    let nivel = raiz;
    for (let i = 0; i < c.linhas.length; i++) {
      const k = i === 0 ? linhaDe(f) : chaveDe(f, c.linhas[i]!);
      const no = nivel.get(k) ?? novo();
      nivel.set(k, no);
      (no.celulas[ci] ??= new Acumulador(contagem)).somar(f, c.medida);
      no.total.somar(f, c.medida);
      nivel = no.filhas;
    }
    porColuna[ci]!.somar(f, c.medida);
    geral.somar(f, c.medida);
  }

  /** As linhas de um nível, com as de dentro; `ordem` é a do primeiro nível, que já passou pelo teto. */
  const montar = (nos: Map<string, No>, i: number, ordem?: string[]): LinhaDaTabela[] => {
    const d = c.linhas[i]!;
    const chaves = ordem ?? ordenar(d, [...nos.keys()], new Map([...nos].map(([k, n]) => [k, n.total.valor()])));
    return chaves
      .filter((k) => nos.has(k))
      .map((k) => {
        const no = nos.get(k)!;
        const linha: LinhaDaTabela = {
          chave: k,
          rotulo: rotuloDoValor(d, k),
          valores: no.celulas.map((a) => a?.valor() ?? 0),
          total: no.total.valor(),
        };
        return i + 1 < c.linhas.length ? { ...linha, filhas: montar(no.filhas, i + 1) } : linha;
      });
  };
  return {
    colunas: colunas.map((k) => ({ chave: k, rotulo: k === TOTAL ? "Total" : rotuloDoValor(c.coluna!, k) })),
    linhas: montar(raiz, 0, primeiras),
    totalPorColuna: porColuna.map((a) => a.valor()),
    total: geral.valor(),
    linhasAgrupadas,
    colunasAgrupadas,
  };
}
