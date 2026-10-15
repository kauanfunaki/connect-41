// A correção da linha da DRE de uma categoria que já está gravada no banco.
//
// Nasceu para "Impostos Retidos Serviços Tomados" (impostos → CMV, 14/10/2026)
// e virou regra comum em 15/10/2026, quando o Pedágio saiu do CMV para as
// despesas fixas administrativas: a mudança no plano padrão só vale para
// escritório que ainda não tem a categoria — "Carregar o plano padrão" só
// completa linha **vazia**, não troca o que o escritório já tem. Cada correção
// diz o nome que procura e as duas linhas (`CorrecaoDaLinha`); os scripts em
// `scripts/dre-*` leem, isto decide, o script grava. Puro, sem banco.
//
// ─── Onde a linha da DRE de uma categoria pode estar gravada ────────────────
//
// 1. `FinanceCategory.dreGroup` da categoria do **plano do escritório**
//    (`companyId` nulo) — vale para toda empresa sem exceção.
// 2. `FinanceCategory.dreGroup` de uma categoria **só de uma empresa** com o
//    mesmo nome (criada à mão, pela fila da DRE ou trazida do Omie).
// 3. `DreCategoryMapping.grupo` — a **exceção** de uma empresa, que ganha das
//    duas acima.
//
// Muda só o que está na linha de origem. O que já está no destino fica; o que
// alguém pôs em outra linha foi decisão de gente, e só aparece no relatório do
// script; o que está sem linha também fica — classificar é decisão de quem
// olha a empresa. (Categoria da empresa sem linha e com o mesmo nome de uma do
// padrão segue a linha do padrão na DRE, que casa por nome; essa muda junto
// com o padrão, sem ninguém tocar nela.)

import { chaveDaCategoria, grupoDoLancamento, type Mapeamento } from "@/lib/dre/calculo";
import { grupoDeTexto, resolverCategorias } from "@/lib/dre/mapeamento";
import { rotuloDoGrupo } from "@/lib/dre/estrutura";
import { padraoAntesDaEmpresa } from "@/lib/financeiro/planoDeContas";

/** O código da auditoria — o nome em português está em `src/lib/auditoria/acoes.ts`. */
export const ACAO_DA_CORRECAO = "dre.categoria.linha_corrigida";

export type CorrecaoDaLinha = {
  /** A linha de onde a categoria sai. */
  de: string;
  /** A linha para onde vai. */
  para: string;
  /** O nome é desta categoria? */
  ehDaCategoria: (nome: string) => boolean;
  /** Parece, mas não é — não muda; sai no relatório para ninguém achar que foi esquecida. */
  pareceComACategoria: (nome: string) => boolean;
  /** O motivo que vai na auditoria (cabe na linha da linha do tempo: até 140 caracteres). */
  motivo: string;
};

// ─── O que mudar ─────────────────────────────────────────────────────────────

export type CategoriaLida = {
  id: string;
  tenantId: string;
  /** Nulo: categoria do plano do escritório. */
  companyId: string | null;
  name: string;
  kind: "PAGAR" | "RECEBER";
  dreGroup: string | null;
};

export type ExcecaoLida = {
  id: string;
  tenantId: string;
  companyId: string;
  categoryId: string;
  grupo: string;
};

/** Onde a linha está gravada — a coluna "onde" do relatório. */
export type OndeEsta = "plano do escritório" | "plano da empresa" | "exceção da empresa";

export type Achado = {
  /** `FinanceCategory` ou `DreCategoryMapping`: a tabela que o script atualiza. */
  tabela: "categoria" | "excecao";
  /** Id da linha nessa tabela. */
  id: string;
  categoryId: string;
  tenantId: string;
  /** A empresa da categoria ou da exceção; nulo no plano do escritório. */
  companyId: string | null;
  onde: OndeEsta;
  nome: string;
  kind: "PAGAR" | "RECEBER";
  /** O texto gravado, como está — a troca só grava se ele ainda for este. */
  valor: string | null;
  /** O grupo que o texto significa para a DRE (`grupoDeTexto`), ou nulo. */
  grupo: string | null;
};

export type PlanoDaCorrecao = {
  /** Na linha de origem: passam para o destino. */
  mudar: Achado[];
  /** Já no destino — nada a fazer. */
  jaNoDestino: Achado[];
  /** Noutra linha da DRE (ou texto que a DRE não reconhece): decisão de alguém, fica. */
  outraLinha: Achado[];
  /** Categoria sem linha da DRE gravada: fica como está. */
  semLinha: Achado[];
};

/**
 * Separa o que muda do que fica. Recebe as categorias já filtradas pelo nome
 * (`ehDaCategoria`) e as exceções dessas categorias. Rodar sobre o resultado
 * já aplicado não acha nada para mudar.
 */
export function planejarCorrecao(correcao: CorrecaoDaLinha, categorias: CategoriaLida[], excecoes: ExcecaoLida[]): PlanoDaCorrecao {
  const plano: PlanoDaCorrecao = { mudar: [], jaNoDestino: [], outraLinha: [], semLinha: [] };
  const porId = new Map(categorias.map((c) => [c.id, c]));

  const separar = (a: Achado) => {
    if (!a.valor?.trim()) plano.semLinha.push(a);
    else if (a.grupo === correcao.de) plano.mudar.push(a);
    else if (a.grupo === correcao.para) plano.jaNoDestino.push(a);
    else plano.outraLinha.push(a);
  };

  for (const c of categorias) {
    if (!correcao.ehDaCategoria(c.name)) continue;
    separar({
      tabela: "categoria",
      id: c.id,
      categoryId: c.id,
      tenantId: c.tenantId,
      companyId: c.companyId,
      onde: c.companyId ? "plano da empresa" : "plano do escritório",
      nome: c.name,
      kind: c.kind,
      valor: c.dreGroup,
      grupo: grupoDeTexto(c.dreGroup),
    });
  }

  for (const e of excecoes) {
    const c = porId.get(e.categoryId);
    if (!c || !correcao.ehDaCategoria(c.name)) continue;
    separar({
      tabela: "excecao",
      id: e.id,
      categoryId: e.categoryId,
      tenantId: e.tenantId,
      companyId: e.companyId,
      onde: "exceção da empresa",
      nome: c.name,
      kind: c.kind,
      valor: e.grupo,
      grupo: grupoDeTexto(e.grupo),
    });
  }

  return plano;
}

/** "Impostos sobre Receita Bruta → CMV sobre Receita Bruta" — o "de → para" da auditoria e do relatório. */
export function deParaDaLinha(correcao: CorrecaoDaLinha, a: Pick<Achado, "valor" | "grupo">): string {
  const de = a.grupo ? rotuloDoGrupo(a.grupo) : (a.valor?.trim() || "sem linha");
  return `${de} → ${rotuloDoGrupo(correcao.para)}`;
}

/** Os detalhes da linha da auditoria de uma troca. */
export function detalhesDaAuditoria(correcao: CorrecaoDaLinha, a: Achado): Record<string, string> {
  return {
    nome: a.nome,
    ...(a.companyId ? { companyId: a.companyId } : {}),
    onde: a.onde,
    linhaDaDre: deParaDaLinha(correcao, a),
    // O texto exato de antes, para desfazer sem adivinhar (o campo é livre e
    // pode ter o rótulo, e não o código).
    gravadoAntes: a.valor ?? "",
    motivo: correcao.motivo,
  };
}

// ─── Quanto muda de linha na DRE ─────────────────────────────────────────────

/**
 * Um valor pago que a DRE soma nesta categoria. Do financeiro do Connect vem
 * com `categoryId`; do arquivo do Omie importado, com o nome como está no
 * arquivo. Em centavos, com o sinal da DRE (pagamento negativo).
 *
 * Quem lê já tirou o lançamento do financeiro de mês que tem arquivo
 * importado — a mesma precedência de `src/lib/dre/data.ts`.
 */
export type ValorPago = {
  tenantId: string;
  companyId: string;
  ano: number;
  mes: number;
  centavos: number;
  origem: "pagamento" | "recebimento";
} & ({ categoryId: string } | { nome: string });

export type ImpactoNoMes = { tenantId: string; companyId: string; ano: number; mes: number; centavos: number };

/**
 * Quanto sai da linha de origem e entra na de destino, por empresa e mês, se o
 * plano for aplicado.
 *
 * Refaz a resolução da DRE (`resolverCategorias` + o mapa por nome de
 * `data.ts`, a categoria da empresa ganhando da do padrão com o mesmo nome)
 * antes e depois da troca, e conta só o valor cuja linha era a de origem e
 * passa a ser a de destino. Empresa com exceção para outra linha não entra: a
 * DRE dela não muda.
 */
export function impactoNaDre(
  correcao: CorrecaoDaLinha,
  categorias: CategoriaLida[],
  excecoes: ExcecaoLida[],
  plano: PlanoDaCorrecao,
  valores: ValorPago[]
): ImpactoNoMes[] {
  const trocaCategoria = new Set(plano.mudar.filter((a) => a.tabela === "categoria").map((a) => a.id));
  const trocaExcecao = new Set(plano.mudar.filter((a) => a.tabela === "excecao").map((a) => a.id));
  const depoisCategorias = categorias.map((c) => (trocaCategoria.has(c.id) ? { ...c, dreGroup: correcao.para } : c));
  const depoisExcecoes = excecoes.map((e) => (trocaExcecao.has(e.id) ? { ...e, grupo: correcao.para } : e));

  const mapas = new Map<string, { antes: Mapeamento; depois: Mapeamento; nomePorId: Map<string, string> }>();
  const mapasDa = (tenantId: string, companyId: string) => {
    const chave = `${tenantId}|${companyId}`;
    let m = mapas.get(chave);
    if (!m) {
      const visiveis = (lista: CategoriaLida[]) =>
        padraoAntesDaEmpresa(lista.filter((c) => c.tenantId === tenantId && (c.companyId === null || c.companyId === companyId)));
      const daEmpresa = (lista: ExcecaoLida[]) => lista.filter((e) => e.tenantId === tenantId && e.companyId === companyId);
      m = {
        antes: mapaPorNome(visiveis(categorias), daEmpresa(excecoes)),
        depois: mapaPorNome(visiveis(depoisCategorias), daEmpresa(depoisExcecoes)),
        nomePorId: new Map(visiveis(categorias).map((c) => [c.id, c.name])),
      };
      mapas.set(chave, m);
    }
    return m;
  };

  const porMes = new Map<string, ImpactoNoMes>();
  for (const v of valores) {
    const m = mapasDa(v.tenantId, v.companyId);
    const nome = "categoryId" in v ? m.nomePorId.get(v.categoryId) : v.nome;
    if (!nome) continue;
    // A mesma regra do cálculo, inclusive a do lado: recebimento num grupo de
    // pagamento cai no não classificado, antes e depois.
    const l = { categoria: nome, valorCentavos: v.centavos, origem: v.origem };
    if (grupoDoLancamento(l, m.antes) !== correcao.de || grupoDoLancamento(l, m.depois) !== correcao.para) continue;
    const chave = `${v.tenantId}|${v.companyId}|${v.ano}|${v.mes}`;
    const atual = porMes.get(chave) ?? { tenantId: v.tenantId, companyId: v.companyId, ano: v.ano, mes: v.mes, centavos: 0 };
    atual.centavos += v.centavos;
    porMes.set(chave, atual);
  }
  return [...porMes.values()].sort((a, b) => a.companyId.localeCompare(b.companyId) || a.ano - b.ano || a.mes - b.mes);
}

/** O mapa nome → grupo como `data.ts` monta: só quem tem grupo entra, e o último com o mesmo nome ganha. */
function mapaPorNome(categorias: CategoriaLida[], excecoes: ExcecaoLida[]): Mapeamento {
  const resolvidas = resolverCategorias(
    categorias.map((c) => ({ id: c.id, nome: c.name, dreGroup: c.dreGroup })),
    excecoes.map((e) => ({ categoryId: e.categoryId, grupo: e.grupo }))
  );
  const m: Mapeamento = new Map();
  for (const r of resolvidas) if (r.grupo) m.set(chaveDaCategoria(r.nome), r.grupo);
  return m;
}
