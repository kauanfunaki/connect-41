// A tabela dinâmica do financeiro (20/10/2026 — "tabelas dinâmicas como o
// Omie, para visualizar e exportar"). Funções puras: as bases, as dimensões e
// as medidas, a leitura da configuração do endereço, as visões prontas e a
// montagem da tabela. Os fatos saem do banco em `tabelaDinamicaServidor.ts`.
//
// ─── Construída aqui, e não uma biblioteca ───────────────────────────────────
//
// A conta é feita no servidor: o acervo da produção é grande (centenas de
// empresas), a permissão por setor é de lá, e a tela recebe só a tabela já
// somada. Linhas (até dois níveis), uma coluna, uma medida e os filtros cobrem
// o que o setor faz com a tabela dinâmica do Omie; para o resto, a exportação
// leva os dados numa Tabela do Excel.

import { formatarCompetencia } from "@/lib/format";

/** O módulo da tela (`/tabela-dinamica`). */
export const MODULO_DA_TABELA_DINAMICA = "bpo_tabela_dinamica";

export const BASES = ["contas", "baixas"] as const;
export type Base = (typeof BASES)[number];

export const ROTULO_DA_BASE: Record<Base, string> = {
  contas: "Contas (títulos)",
  baixas: "Baixas (caixa realizado)",
};

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

export type Configuracao = {
  base: Base;
  /** Um ou dois níveis. */
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
    .slice(0, 2) as Dimensao[];
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

/** A configuração de volta ao endereço — o que os links e o formulário usam. */
export function paramsDaConfiguracao(c: Configuracao, extra: Record<string, string | undefined> = {}): URLSearchParams {
  const q = new URLSearchParams();
  q.set("base", c.base);
  q.set("linhas", c.linhas.join(","));
  q.set("coluna", c.coluna ?? "nenhuma");
  q.set("medida", c.medida);
  if (c.filtros.tipo !== "ambos") q.set("tipo", c.filtros.tipo);
  if (!c.filtros.de && !c.filtros.ate) q.set("periodo", "todos");
  if (c.filtros.de) q.set("de", c.filtros.de);
  if (c.filtros.ate) q.set("ate", c.filtros.ate);
  if (c.base === "contas" && c.filtros.periodoPor === "vencimento") q.set("periodoPor", "vencimento");
  if (c.base === "contas" && c.filtros.situacao !== "todas") q.set("situacao", c.filtros.situacao);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return q;
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
 * A tabela: as linhas (um ou dois níveis), as colunas, os totais. Cada célula,
 * cada subtotal e cada total é acumulado à parte — na contagem, somar as
 * células contaria duas vezes a conta que aparece em duas.
 */
export function montarTabela(fatos: readonly Fato[], c: Pick<Configuracao, "linhas" | "coluna" | "medida">): Tabela {
  const contagem = MEDIDAS[c.medida].tipo === "contagem";
  const [d1, d2] = c.linhas as [Dimensao, Dimensao | undefined];
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

  type No = { celulas: Acumulador[]; total: Acumulador; filhas: Map<string, No> };
  const novo = (): No => ({ celulas: colunas.map(() => new Acumulador(contagem)), total: new Acumulador(contagem), filhas: new Map() });
  const raiz = new Map<string, No>();
  const porColuna = colunas.map(() => new Acumulador(contagem));
  const geral = new Acumulador(contagem);

  for (const f of fatos) {
    const ci = colunaDe(f);
    const k1 = linhaDe(f);
    const n1 = raiz.get(k1) ?? novo();
    raiz.set(k1, n1);
    n1.celulas[ci]!.somar(f, c.medida);
    n1.total.somar(f, c.medida);
    if (d2) {
      const k2 = chaveDe(f, d2);
      const n2 = n1.filhas.get(k2) ?? novo();
      n1.filhas.set(k2, n2);
      n2.celulas[ci]!.somar(f, c.medida);
      n2.total.somar(f, c.medida);
    }
    porColuna[ci]!.somar(f, c.medida);
    geral.somar(f, c.medida);
  }

  const linha = (d: Dimensao, chave: string, no: No): LinhaDaTabela => ({
    chave,
    rotulo: rotuloDoValor(d, chave),
    valores: no.celulas.map((a) => a.valor()),
    total: no.total.valor(),
  });
  return {
    colunas: colunas.map((k) => ({ chave: k, rotulo: k === TOTAL ? "Total" : rotuloDoValor(c.coluna!, k) })),
    linhas: primeiras
      .filter((k) => raiz.has(k))
      .map((k) => {
        const no = raiz.get(k)!;
        const base = linha(d1, k, no);
        if (!d2) return base;
        const totais = new Map([...no.filhas].map(([k2, n]) => [k2, n.total.valor()]));
        return { ...base, filhas: ordenar(d2, [...no.filhas.keys()], totais).map((k2) => linha(d2, k2, no.filhas.get(k2)!)) };
      }),
    totalPorColuna: porColuna.map((a) => a.valor()),
    total: geral.valor(),
    linhasAgrupadas,
    colunasAgrupadas,
  };
}
