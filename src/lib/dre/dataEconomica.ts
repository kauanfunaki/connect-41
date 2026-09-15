// A leitura da DRE econômica e das análises: do banco até os lançamentos que
// as funções puras consomem.
//
// ─── Dois recortes, cada um num lugar só ─────────────────────────────────────
//
// **Competência:** `competence IN (...)`, qualquer status menos cancelado.
// **Caixa:** `paidAt` dentro dos meses — a mesma régua de `dreDoMes`.
//
// O caixa daqui usa **só `FinanceEntry`**, sem o import do Omie. As análises
// cruzam competência com caixa lançamento a lançamento, e o import não tem
// lançamento nem competência; misturar faria a ponte não fechar. As telas que
// usam isto dizem isso na cara.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { chaveDaCategoria, calcularDre, type LancamentoDoDre, type Mapeamento, type ResultadoDoDre } from "./calculo";
import { resolverCategorias } from "./mapeamento";
import { centavosDeDecimal } from "./data";
import { OPCOES_PADRAO } from "./estrutura";
import { calcularDreEconomica, paraLancamentoDoDre, type DreEconomica, type LancamentoFinanceiro } from "./economica";
import { resultadoDePorGrupo, somarPorGrupo, type ConjuntosDaReconciliacao } from "./analises";
import {
  competenciaDoInstante,
  inicioDaCompetencia,
  somarMeses,
} from "@/lib/financeiro/periodo";

type Contexto = { mapeamento: Mapeamento; nomePorId: Map<string, string> };

/** O de-para desta empresa: plano de contas do escritório + exceções da empresa. */
export async function contextoDoDre(tenantId: string, companyId: string): Promise<Contexto> {
  const prisma = getPrisma();
  const [categorias, excecoes] = await Promise.all([
    prisma.financeCategory.findMany({ where: { tenantId }, select: { id: true, name: true, dreGroup: true } }),
    prisma.dreCategoryMapping.findMany({ where: { tenantId, companyId }, select: { categoryId: true, grupo: true } }),
  ]);
  const resolvidas = resolverCategorias(
    categorias.map((c) => ({ id: c.id, nome: c.name, dreGroup: c.dreGroup })),
    excecoes
  );
  const mapeamento: Mapeamento = new Map();
  for (const c of resolvidas) if (c.grupo) mapeamento.set(chaveDaCategoria(c.nome), c.grupo);
  return { mapeamento, nomePorId: new Map(resolvidas.map((c) => [c.id, c.nome])) };
}

const SELECAO = {
  id: true,
  kind: true,
  status: true,
  amount: true,
  categoryId: true,
  competence: true,
  paidAt: true,
  dueDate: true,
} as const;

type Linha = {
  id: string;
  kind: "PAGAR" | "RECEBER";
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  amount: { toString(): string };
  categoryId: string | null;
  competence: string;
  paidAt: Date | null;
  dueDate: Date;
};

function paraFinanceiro(l: Linha, nomePorId: Map<string, string>): LancamentoFinanceiro {
  return {
    kind: l.kind,
    status: l.status,
    centavos: centavosDeDecimal(l.amount),
    categoria: l.categoryId ? nomePorId.get(l.categoryId) ?? null : null,
  };
}

/** A DRE econômica de cada competência pedida. Uma consulta para todas. */
export async function serieEconomica(
  tenantId: string,
  companyId: string,
  competencias: string[]
): Promise<Map<string, DreEconomica>> {
  const prisma = getPrisma();
  const [ctx, linhas] = await Promise.all([
    contextoDoDre(tenantId, companyId),
    prisma.financeEntry.findMany({
      where: { tenantId, companyId, competence: { in: competencias }, status: { not: "CANCELADO" } },
      select: SELECAO,
    }),
  ]);
  const porMes = new Map<string, LancamentoFinanceiro[]>(competencias.map((c) => [c, []]));
  for (const l of linhas) porMes.get(l.competence)?.push(paraFinanceiro(l, ctx.nomePorId));
  return new Map(competencias.map((c) => [c, calcularDreEconomica(porMes.get(c)!, ctx.mapeamento)]));
}

/**
 * A DRE de caixa de cada mês pedido, **só com lançamentos do Connect**.
 *
 * Os meses têm de ser contíguos: a consulta é um intervalo de `paidAt` do
 * primeiro ao último.
 */
export async function serieDeCaixa(
  tenantId: string,
  companyId: string,
  competencias: string[]
): Promise<Map<string, ResultadoDoDre>> {
  const prisma = getPrisma();
  const inicio = [...competencias].sort()[0]!;
  const fim = [...competencias].sort().at(-1)!;
  const [ctx, linhas] = await Promise.all([
    contextoDoDre(tenantId, companyId),
    prisma.financeEntry.findMany({
      where: {
        tenantId,
        companyId,
        paidAt: { gte: inicioDaCompetencia(inicio), lt: inicioDaCompetencia(somarMeses(fim, 1)) },
      },
      select: SELECAO,
    }),
  ]);
  const porMes = new Map<string, LancamentoDoDre[]>(competencias.map((c) => [c, []]));
  for (const l of linhas) {
    porMes.get(competenciaDoInstante(l.paidAt!))?.push(paraLancamentoDoDre(paraFinanceiro(l, ctx.nomePorId)));
  }
  return new Map(competencias.map((c) => [c, calcularDre(porMes.get(c)!, ctx.mapeamento, OPCOES_PADRAO)]));
}

/**
 * Os três conjuntos da reconciliação de um mês.
 *
 * Uma consulta com `OR` — competência do mês ou pago no mês —, e a partição em
 * memória. Cada lançamento cai em exatamente um conjunto, que é o que faz a
 * ponte fechar sem resíduo.
 */
export async function dadosDaReconciliacao(
  tenantId: string,
  companyId: string,
  competencia: string
): Promise<{ conjuntos: ConjuntosDaReconciliacao; mapeamento: Mapeamento }> {
  const prisma = getPrisma();
  const de = inicioDaCompetencia(competencia);
  const ate = inicioDaCompetencia(somarMeses(competencia, 1));
  const [ctx, linhas] = await Promise.all([
    contextoDoDre(tenantId, companyId),
    prisma.financeEntry.findMany({
      where: {
        tenantId,
        companyId,
        OR: [{ competence: competencia, status: { not: "CANCELADO" } }, { paidAt: { gte: de, lt: ate } }],
      },
      select: SELECAO,
    }),
  ]);

  const conjuntos: ConjuntosDaReconciliacao = { ambos: [], soCompetencia: [], soCaixa: [] };
  for (const l of linhas) {
    const lanc = paraLancamentoDoDre(paraFinanceiro(l, ctx.nomePorId));
    const economico = l.competence === competencia && l.status !== "CANCELADO";
    const caixa = l.paidAt !== null && l.paidAt >= de && l.paidAt < ate;
    if (economico && caixa) conjuntos.ambos.push(lanc);
    else if (economico) conjuntos.soCompetencia.push(lanc);
    else if (caixa) conjuntos.soCaixa.push(lanc);
  }
  return { conjuntos, mapeamento: ctx.mapeamento };
}

/** Vencimento × liquidação do que foi liquidado no mês, por tipo. */
export async function paresDeLiquidacao(
  tenantId: string,
  companyId: string,
  competencia: string
): Promise<Record<"PAGAR" | "RECEBER", { vencimentoKey: string; liquidadoKey: string }[]>> {
  const prisma = getPrisma();
  const linhas = await prisma.financeEntry.findMany({
    where: {
      tenantId,
      companyId,
      paidAt: { gte: inicioDaCompetencia(competencia), lt: inicioDaCompetencia(somarMeses(competencia, 1)) },
    },
    select: { kind: true, dueDate: true, paidAt: true },
  });
  const saida: Record<"PAGAR" | "RECEBER", { vencimentoKey: string; liquidadoKey: string }[]> = { PAGAR: [], RECEBER: [] };
  for (const l of linhas) {
    saida[l.kind].push({ vencimentoKey: saoPauloParts(l.dueDate).dateKey, liquidadoKey: saoPauloParts(l.paidAt!).dateKey });
  }
  return saida;
}

/**
 * Uma DRE só para um período de um ou mais meses contíguos, no regime pedido.
 *
 * Soma por grupo e remonta as linhas — os percentuais do período saem dos
 * valores somados, não da média dos percentuais mensais, a mesma regra da
 * visão anual de `/dre`.
 */
export async function resultadoDoPeriodo(
  tenantId: string,
  companyId: string,
  competencias: string[],
  regime: "competencia" | "caixa"
): Promise<ResultadoDoDre> {
  const porGrupo =
    regime === "competencia"
      ? [...(await serieEconomica(tenantId, companyId, competencias)).values()].map((m) => m.resultado.porGrupo)
      : [...(await serieDeCaixa(tenantId, companyId, competencias)).values()].map((r) => r.porGrupo);
  return resultadoDePorGrupo(somarPorGrupo(porGrupo));
}

/** Competências com lançamento nesta empresa, mais recente primeiro. */
export async function competenciasDaEmpresa(tenantId: string, companyId: string): Promise<string[]> {
  const prisma = getPrisma();
  const linhas = await prisma.financeEntry.groupBy({
    by: ["competence"],
    where: { tenantId, companyId, status: { not: "CANCELADO" } },
    orderBy: { competence: "desc" },
    take: 36,
  });
  return linhas.map((l) => l.competence);
}
