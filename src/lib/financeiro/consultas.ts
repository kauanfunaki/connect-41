// Consultas das telas de fluxo de caixa, relatório por empresa e do portal.
//
// ─── O escopo é o primeiro argumento ─────────────────────────────────────────
//
// A mesma regra de `src/lib/fiscal/alcance.ts`: a equipe vê o tenant, o cliente
// no portal vê só as empresas do grupo dele. `companyIds: []` resolve para
// **nada** (`IN ()`), nunca para tudo — um cliente sem empresa vinculada não
// pode herdar o tenant inteiro por uma cláusula vazia.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { centavosDeDecimal, situacaoDaConta, type SituacaoDaConta } from "./contas";
import { seloDeAprovacaoVisivel, type StatusDeAprovacao } from "./aprovacao/regras";
import { competenciaDoInstante, inicioDaCompetencia, somarMeses } from "./periodo";
import type { MovimentoRealizado, TituloEmAberto, SomaPorEmpresa, ContagemPorEmpresa } from "./fluxo";

export type EscopoFinanceiro = {
  tenantId: string;
  /** `null` = o tenant inteiro (equipe). Lista = só essas empresas (portal, ou filtro). */
  companyIds: string[] | null;
};

export function whereDoEscopo(e: EscopoFinanceiro): Prisma.FinanceEntryWhereInput {
  if (e.companyIds === null) return { tenantId: e.tenantId };
  return { tenantId: e.tenantId, companyId: { in: e.companyIds } };
}

/** Início do dia de hoje em São Paulo — o corte de "vencida" que `situacaoDaConta` usa. */
function inicioDeHoje(hojeKey: string): Date {
  return new Date(`${hojeKey}T00:00:00-03:00`);
}

/** Tudo que foi pago ou recebido nas competências de caixa pedidas (contíguas). */
export async function movimentosRealizados(e: EscopoFinanceiro, competencias: string[]): Promise<MovimentoRealizado[]> {
  if (competencias.length === 0) return [];
  const prisma = getPrisma();
  const linhas = await prisma.financeEntry.findMany({
    where: {
      ...whereDoEscopo(e),
      paidAt: {
        gte: inicioDaCompetencia(competencias[0]!),
        lt: inicioDaCompetencia(somarMeses(competencias[competencias.length - 1]!, 1)),
      },
    },
    select: { kind: true, amount: true, paidAt: true },
  });
  return linhas.map((l) => ({
    competenciaDeCaixa: competenciaDoInstante(l.paidAt!),
    kind: l.kind,
    centavos: centavosDeDecimal(l.amount),
  }));
}

export type TituloComContraparte = TituloEmAberto & { contraparteNome: string; companyId: string };

/**
 * Títulos que ainda não andaram: sem baixa e não cancelados.
 *
 * Teto de 5.000 linhas: a projeção é agregada, e passar disso num escopo é
 * sinal de lançamento esquecido em aberto, não de volume real.
 */
export async function titulosEmAberto(e: EscopoFinanceiro): Promise<TituloComContraparte[]> {
  const prisma = getPrisma();
  const linhas = await prisma.financeEntry.findMany({
    where: { ...whereDoEscopo(e), paidAt: null, status: { not: "CANCELADO" } },
    select: { kind: true, amount: true, dueDate: true, companyId: true, counterparty: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
    take: 5_000,
  });
  return linhas.map((l) => ({
    kind: l.kind,
    centavos: centavosDeDecimal(l.amount),
    vencimentoKey: saoPauloParts(l.dueDate).dateKey,
    contraparteNome: l.counterparty.name,
    companyId: l.companyId,
  }));
}

/** As somas do mês e as vencidas por empresa, para `consolidarPorEmpresa`. */
export async function dadosDoConsolidado(
  e: EscopoFinanceiro,
  competencia: string,
  hojeKey: string
): Promise<{ somas: SomaPorEmpresa[]; vencidas: ContagemPorEmpresa[] }> {
  const prisma = getPrisma();
  const [somas, vencidas] = await Promise.all([
    prisma.financeEntry.groupBy({
      by: ["companyId", "kind"],
      where: {
        ...whereDoEscopo(e),
        paidAt: { gte: inicioDaCompetencia(competencia), lt: inicioDaCompetencia(somarMeses(competencia, 1)) },
      },
      _sum: { amount: true },
    }),
    prisma.financeEntry.groupBy({
      by: ["companyId", "kind"],
      where: {
        ...whereDoEscopo(e),
        paidAt: null,
        status: { not: "CANCELADO" },
        dueDate: { lt: inicioDeHoje(hojeKey) },
      },
      _count: { _all: true },
    }),
  ]);
  return {
    somas: somas.map((s) => ({
      companyId: s.companyId,
      kind: s.kind,
      centavos: s._sum.amount ? centavosDeDecimal(s._sum.amount) : 0,
    })),
    vencidas: vencidas.map((v) => ({ companyId: v.companyId, kind: v.kind, quantidade: v._count._all })),
  };
}

/** Nome de exibição das empresas, por id. */
export async function nomesDasEmpresas(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const prisma = getPrisma();
  const empresas = await prisma.company.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true, displayName: true },
  });
  return new Map(empresas.map((c) => [c.id, nomeExibicao(c)]));
}

export type EmpresaDoSeletor = { id: string; nome: string };

/**
 * Empresas para o seletor das telas internas: ativas, por nome de exibição.
 *
 * Seletor, e não fileira de links como o `/dre` faz: com quase quatrocentas
 * empresas em produção, as doze primeiras em aba escondem as outras.
 */
export async function empresasDoSeletor(tenantId: string, ids?: string[]): Promise<EmpresaDoSeletor[]> {
  const prisma = getPrisma();
  const empresas = await prisma.company.findMany({
    where: { tenantId, ...(ids ? { id: { in: ids } } : { status: "ACTIVE" }) },
    select: { id: true, name: true, displayName: true },
  });
  return empresas
    .map((c) => ({ id: c.id, nome: nomeExibicao(c) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type ContaDoPortal = {
  id: string;
  situacao: SituacaoDaConta;
  valorCentavos: number;
  vencimento: Date;
  vencimentoKey: string;
  pagoEm: Date | null;
  competencia: string;
  empresaNome: string;
  contraparteNome: string;
  categoriaNome: string | null;
  descricao: string | null;
  /** O selo da aprovação por alçada, quando a lista deve mostrá-lo (`seloDeAprovacaoVisivel`). */
  aprovacao: StatusDeAprovacao | null;
};

/**
 * As contas de um tipo no escopo, só leitura.
 *
 * Não reaproveita `listarContas` porque ela filtra por **uma** empresa e o
 * portal enxerga o grupo. O teto de 500 é o do que cabe ler numa tela sem
 * filtro — o portal é consulta, não inventário.
 */
export async function contasDoEscopo(
  e: EscopoFinanceiro,
  kind: "PAGAR" | "RECEBER",
  hojeKey: string
): Promise<ContaDoPortal[]> {
  const prisma = getPrisma();
  const linhas = await prisma.financeEntry.findMany({
    where: { ...whereDoEscopo(e), kind, status: { not: "CANCELADO" } },
    select: {
      id: true,
      status: true,
      amount: true,
      dueDate: true,
      paidAt: true,
      competence: true,
      description: true,
      approvalStatus: true,
      company: { select: { name: true, displayName: true } },
      counterparty: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { dueDate: "desc" },
    take: 500,
  });
  return linhas.map((l) => {
    const vencimentoKey = saoPauloParts(l.dueDate).dateKey;
    return {
      id: l.id,
      situacao: situacaoDaConta(l, hojeKey, vencimentoKey),
      valorCentavos: centavosDeDecimal(l.amount),
      vencimento: l.dueDate,
      vencimentoKey,
      pagoEm: l.paidAt,
      competencia: l.competence,
      empresaNome: nomeExibicao(l.company),
      contraparteNome: l.counterparty.name,
      categoriaNome: l.category?.name ?? null,
      descricao: l.description,
      aprovacao: seloDeAprovacaoVisivel(l) ? l.approvalStatus : null,
    };
  });
}
