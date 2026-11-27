// As consultas da lista de Lançamentos (27/11/2026, melhoria-571): a página
// aberta, a contagem e os totais do filtro inteiro, e os valores de cada funil.
// As regras puras (funis, `where`) moram em `paginaDeLancamentos.ts`.

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { centavosDeDecimal } from "./contas";
import { diaDaChave, totalDePaginas } from "./paginaDeContas";
import {
  LANCAMENTOS_POR_PAGINA,
  SITUACOES_DO_LANCAMENTO,
  TIPOS_DO_LANCAMENTO,
  situacaoDoLancamento,
  whereDosFunisDosLancamentos,
  type ChaveDoFunilDoLancamento,
  type FunisDosLancamentos,
} from "./paginaDeLancamentos";

/** O que a linha da lista mostra. */
const SELECAO_DO_LANCAMENTO = {
  id: true,
  omieTitleId: true,
  omieMovementId: true,
  company: { select: { omieCutoverAt: true } },
  kind: true,
  status: true,
  amount: true,
  dueDate: true,
  paidAt: true,
  description: true,
  fiscalDocumentId: true,
  closeReason: true,
  agreementId: true,
  paidPrincipal: true,
  counterparty: { select: { name: true } },
  category: { select: { name: true } },
  costCenter: { select: { name: true } },
  project: { select: { name: true } },
  documentNumber: true,
  recurrenceId: true,
  recurrenceIndex: true,
  recurrenceTotal: true,
} satisfies Prisma.FinanceEntrySelect;

export type LancamentoDaLista = Prisma.FinanceEntryGetPayload<{ select: typeof SELECAO_DO_LANCAMENTO }>;

export type RecorteDosLancamentos = { tenantId: string; companyId: string; mes: string; funis: FunisDosLancamentos };

/** Os lançamentos à mão da empresa no mês — o que não veio de nota. */
function whereDaBase(r: RecorteDosLancamentos): Prisma.FinanceEntryWhereInput {
  return { tenantId: r.tenantId, companyId: r.companyId, competence: r.mes, fiscalDocumentId: null };
}

/**
 * A página pedida da lista, com a contagem e os totais por lado do filtro
 * inteiro. A página além do fim (link antigo, a última esvaziou) cai na última
 * que existe, como em Transferências.
 */
export async function paginaDeLancamentos(r: RecorteDosLancamentos, pedida: number) {
  const prisma = getPrisma();
  const where: Prisma.FinanceEntryWhereInput = { AND: [whereDaBase(r), ...whereDosFunisDosLancamentos(r.funis)] };
  const buscar = (p: number) =>
    prisma.financeEntry.findMany({
      where,
      select: SELECAO_DO_LANCAMENTO,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      skip: (p - 1) * LANCAMENTOS_POR_PAGINA,
      take: LANCAMENTOS_POR_PAGINA,
    });

  const [total, somas, primeira] = await Promise.all([
    prisma.financeEntry.count({ where }),
    // O total da barra por lado, sem os cancelados (a nota de rodapé da tela).
    prisma.financeEntry.groupBy({ by: ["kind"], where: { AND: [where, { status: { not: "CANCELADO" } }] }, _sum: { amount: true } }),
    buscar(pedida),
  ]);
  const ultima = totalDePaginas(total, LANCAMENTOS_POR_PAGINA);
  const pagina = Math.min(pedida, ultima);
  const linhas = pagina === pedida ? primeira : await buscar(pagina);
  const somaDe = (kind: "PAGAR" | "RECEBER") => {
    const s = somas.find((g) => g.kind === kind)?._sum.amount;
    return s ? centavosDeDecimal(s) : 0;
  };
  return { linhas, total, pagina, totalDePaginas: ultima, aPagarCentavos: somaDe("PAGAR"), aReceberCentavos: somaDe("RECEBER") };
}

/** Um valor oferecido no funil, com quantos lançamentos têm. */
export type OpcaoDoFunilDoLancamento = { valor: string; rotulo: string; n: number };

/** Por nome, como o Excel; o vazio no fim. */
function porNome(a: OpcaoDoFunilDoLancamento, b: OpcaoDoFunilDoLancamento): number {
  if (a.valor === "" || b.valor === "") return a.valor === "" ? (b.valor === "" ? 0 : 1) : -1;
  return a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base", numeric: true });
}

/**
 * Os valores de cada funil, com a contagem — da empresa no mês, em cascata
 * como no Excel: cada funil conta os lançamentos que passam pelos **outros**.
 * Vão com a página: o recorte é uma empresa num mês, e os valores são poucos
 * (Contas, que é do escritório inteiro, pede quando o funil abre).
 */
export async function opcoesDosFunisDosLancamentos(
  r: RecorteDosLancamentos
): Promise<Record<ChaveDoFunilDoLancamento, OpcaoDoFunilDoLancamento[]>> {
  const prisma = getPrisma();
  const whereSem = (chave: ChaveDoFunilDoLancamento): Prisma.FinanceEntryWhereInput => ({
    AND: [whereDaBase(r), ...whereDosFunisDosLancamentos(r.funis, chave)],
  });

  const [tipos, contrapartes, categorias, centros, vencimentos, situacoes] = await Promise.all([
    prisma.financeEntry.groupBy({ by: ["kind"], where: whereSem("tipo"), _count: { _all: true } }),
    prisma.financeEntry.groupBy({ by: ["counterpartyId"], where: whereSem("contraparte"), _count: { _all: true } }),
    prisma.financeEntry.groupBy({ by: ["categoryId"], where: whereSem("categoria"), _count: { _all: true } }),
    prisma.financeEntry.groupBy({ by: ["costCenterId"], where: whereSem("centro"), _count: { _all: true } }),
    prisma.financeEntry.groupBy({ by: ["dueDate"], where: whereSem("vencimento"), _count: { _all: true } }),
    prisma.financeEntry.groupBy({ by: ["status", "closeReason"], where: whereSem("situacao"), _count: { _all: true } }),
  ]);

  const idsDeCategoria = categorias.map((g) => g.categoryId).filter((id): id is string => id !== null);
  const idsDeCentro = centros.map((g) => g.costCenterId).filter((id): id is string => id !== null);
  const [nomesDeContraparte, nomesDeCategoria, nomesDeCentro] = await Promise.all([
    contrapartes.length
      ? prisma.financeCounterparty.findMany({ where: { tenantId: r.tenantId, id: { in: contrapartes.map((g) => g.counterpartyId) } }, select: { id: true, name: true } })
      : [],
    idsDeCategoria.length ? prisma.financeCategory.findMany({ where: { tenantId: r.tenantId, id: { in: idsDeCategoria } }, select: { id: true, name: true } }) : [],
    idsDeCentro.length ? prisma.costCenter.findMany({ where: { tenantId: r.tenantId, id: { in: idsDeCentro } }, select: { id: true, name: true } }) : [],
  ]);
  const nomes = (lista: { id: string; name: string }[]) => new Map(lista.map((c) => [c.id, c.name]));
  const contraparte = nomes(nomesDeContraparte);
  const categoria = nomes(nomesDeCategoria);
  const centro = nomes(nomesDeCentro);

  const porDia = new Map<string, number>();
  for (const g of vencimentos) {
    const dia = saoPauloParts(g.dueDate).dateKey;
    porDia.set(dia, (porDia.get(dia) ?? 0) + g._count._all);
  }
  const porSituacao = new Map<string, number>();
  for (const g of situacoes) {
    const s = situacaoDoLancamento(g);
    porSituacao.set(s, (porSituacao.get(s) ?? 0) + g._count._all);
  }

  return {
    tipo: TIPOS_DO_LANCAMENTO.map((t) => ({ valor: t.valor, rotulo: t.rotulo, n: tipos.find((g) => g.kind === t.valor)?._count._all ?? 0 })).filter((o) => o.n > 0),
    contraparte: contrapartes
      .map((g) => ({ valor: g.counterpartyId, rotulo: contraparte.get(g.counterpartyId) ?? "(sem nome)", n: g._count._all }))
      .sort(porNome),
    categoria: categorias
      .map((g) => ({ valor: g.categoryId ?? "", rotulo: g.categoryId === null ? "(sem categoria)" : (categoria.get(g.categoryId) ?? "(sem nome)"), n: g._count._all }))
      .sort(porNome),
    centro: centros
      .map((g) => ({ valor: g.costCenterId ?? "", rotulo: g.costCenterId === null ? "(sem centro de custo)" : (centro.get(g.costCenterId) ?? "(sem nome)"), n: g._count._all }))
      .sort(porNome),
    // Na ordem do calendário, como a lista.
    vencimento: [...porDia].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, n]) => ({ valor: dia, rotulo: diaDaChave(dia), n })),
    situacao: SITUACOES_DO_LANCAMENTO.map((s) => ({ valor: s.valor, rotulo: s.rotulo, n: porSituacao.get(s.valor) ?? 0 })).filter((o) => o.n > 0),
  };
}
