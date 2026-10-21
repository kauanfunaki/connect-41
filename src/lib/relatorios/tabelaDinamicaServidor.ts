// A leitura da tabela dinâmica no banco (20/10/2026): os fatos de uma base,
// com os filtros da tela. As regras e a montagem são puras e moram em
// `tabelaDinamica.ts` e `fatos.ts`.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { inicioDeHoje } from "@/lib/financeiro/consultas";
import { inicioDaCompetencia, somarMeses } from "@/lib/financeiro/periodo";
import { movimentosDeCaixa, baixasNoPeriodo } from "@/lib/financeiro/baixa/consultas";
import { fatosDasBaixas, fatosDasContas, type ContaParaFato } from "./fatos";
import type { Configuracao, Fato } from "./tabelaDinamica";

/** Teto de linhas lidas por consulta: a tela soma no servidor, e passar disto pede um filtro. */
export const LIMITE_DE_FATOS = 60_000;

export type FatosDaBase = { fatos: Fato[]; limitada: boolean };

const dia = (d: Date | null) => (d ? saoPauloParts(d).dateKey : null);

/** O recorte de datas `[de, ate]` em meses, como intervalo de instantes. Sem um lado, sem limite daquele lado. */
function intervalo(de: string | null, ate: string | null): { gte?: Date; lt?: Date } {
  return {
    ...(de ? { gte: inicioDaCompetencia(de) } : {}),
    ...(ate ? { lt: inicioDaCompetencia(somarMeses(ate, 1)) } : {}),
  };
}

/** Os fatos da base escolhida, numa empresa ou no escritório inteiro (`empresaId` nulo). */
export async function fatosDaBase(tenantId: string, empresaId: string | null, c: Configuracao, agora: Date): Promise<FatosDaBase> {
  return c.base === "baixas" ? fatosDeBaixas(tenantId, empresaId, c) : fatosDeContas(tenantId, empresaId, c, agora);
}

async function fatosDeContas(tenantId: string, empresaId: string | null, c: Configuracao, agora: Date): Promise<FatosDaBase> {
  const hojeKey = saoPauloParts(agora).dateKey;
  const f = c.filtros;
  const e: Prisma.FinanceEntryWhereInput[] = [{ tenantId, status: { not: "CANCELADO" } }];
  if (empresaId) e.push({ companyId: empresaId });
  if (f.tipo !== "ambos") e.push({ kind: f.tipo });
  if (f.de || f.ate) {
    e.push(
      f.periodoPor === "vencimento"
        ? { dueDate: intervalo(f.de, f.ate) }
        : { competence: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lte: f.ate } : {}) } }
    );
  }
  if (f.situacao === "abertas" || f.situacao === "vencidas") e.push({ paidAt: null, status: { not: "PAGO" } });
  if (f.situacao === "vencidas") e.push({ dueDate: { lt: inicioDeHoje(hojeKey) } });
  if (f.situacao === "quitadas") e.push({ OR: [{ status: "PAGO" }, { paidAt: { not: null } }] });

  const nome = { select: { name: true } } as const;
  const categoria = { select: { name: true, planGroup: true } } as const;
  const linhas = await getPrisma().financeEntry.findMany({
    where: { AND: e },
    select: {
      id: true,
      kind: true,
      status: true,
      paidAt: true,
      approvalStatus: true,
      amount: true,
      paidPrincipal: true,
      competence: true,
      dueDate: true,
      forecastDate: true,
      company: { select: { name: true, displayName: true } },
      counterparty: nome,
      category: categoria,
      costCenter: nome,
      project: nome,
      allocations: {
        select: { amount: true, category: categoria, costCenter: nome, project: nome },
        orderBy: { position: "asc" },
      },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: LIMITE_DE_FATOS + 1,
  });
  const limitada = linhas.length > LIMITE_DE_FATOS;
  const cat = (x: { name: string; planGroup: string | null } | null) => ({ nome: x?.name ?? null, grupo: x?.planGroup ?? null });
  const contas: ContaParaFato[] = linhas.slice(0, LIMITE_DE_FATOS).map((l) => ({
    id: l.id,
    kind: l.kind,
    status: l.status,
    paidAt: l.paidAt,
    approvalStatus: l.approvalStatus,
    valorCentavos: centavosDeDecimal(l.amount),
    baixadoCentavos: centavosDeDecimal(l.paidPrincipal),
    competencia: l.competence,
    vencimentoKey: dia(l.dueDate)!,
    previsaoKey: dia(l.forecastDate),
    quitacaoKey: dia(l.paidAt),
    empresa: nomeExibicao(l.company),
    contraparte: l.counterparty.name,
    categoria: cat(l.category),
    centro: { nome: l.costCenter?.name ?? null },
    projeto: { nome: l.project?.name ?? null },
    partes: l.allocations.map((a) => ({
      categoria: cat(a.category),
      centro: { nome: a.costCenter?.name ?? null },
      projeto: { nome: a.project?.name ?? null },
      centavos: centavosDeDecimal(a.amount),
    })),
  }));
  return { fatos: fatosDasContas(contas, hojeKey), limitada };
}

async function fatosDeBaixas(tenantId: string, empresaId: string | null, c: Configuracao): Promise<FatosDaBase> {
  const f = c.filtros;
  const { gte, lt } = intervalo(f.de, f.ate);
  // Sem período, o acervo inteiro — o teto de linhas segura o volume.
  let movimentos = await movimentosDeCaixa(
    baixasNoPeriodo({ tenantId, ...(empresaId ? { companyId: empresaId } : {}) }, gte ?? new Date(0), lt ?? new Date(Date.UTC(9999, 0, 1)))
  );
  if (f.tipo !== "ambos") movimentos = movimentos.filter((m) => m.kind === f.tipo);
  const limitada = movimentos.length > LIMITE_DE_FATOS;
  movimentos = movimentos.slice(0, LIMITE_DE_FATOS);

  // Os nomes, uma consulta por cadastro, só dos ids que apareceram.
  const ids = (k: (m: (typeof movimentos)[number]) => string | null) => [...new Set(movimentos.map(k).filter((x): x is string => !!x))];
  const prisma = getPrisma();
  const [categorias, centros, projetos, empresas, contrapartes] = await Promise.all([
    prisma.financeCategory.findMany({ where: { tenantId, id: { in: ids((m) => m.categoryId) } }, select: { id: true, name: true, planGroup: true } }),
    prisma.costCenter.findMany({ where: { tenantId, id: { in: ids((m) => m.costCenterId) } }, select: { id: true, name: true } }),
    prisma.financeProject.findMany({ where: { tenantId, id: { in: ids((m) => m.projectId) } }, select: { id: true, name: true } }),
    prisma.company.findMany({ where: { tenantId, id: { in: ids((m) => m.companyId) } }, select: { id: true, name: true, displayName: true } }),
    prisma.financeCounterparty.findMany({ where: { tenantId, id: { in: ids((m) => m.counterpartyId) } }, select: { id: true, name: true } }),
  ]);
  const porId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const [mCat, mCentro, mProjeto, mEmpresa, mContraparte] = [porId(categorias), porId(centros), porId(projetos), porId(empresas), porId(contrapartes)];

  return {
    fatos: fatosDasBaixas(
      movimentos.map((m) => {
        const categoria = m.categoryId ? mCat.get(m.categoryId) : undefined;
        const empresa = mEmpresa.get(m.companyId);
        return {
          paymentId: m.paymentId,
          kind: m.kind,
          parte: m.parte,
          centavos: m.centavos,
          pagamentoKey: dia(m.paidAt)!,
          competencia: m.competence,
          empresa: empresa ? nomeExibicao(empresa) : "",
          contraparte: mContraparte.get(m.counterpartyId)?.name ?? "",
          categoria: { nome: categoria?.name ?? null, grupo: categoria?.planGroup ?? null },
          centro: { nome: m.costCenterId ? mCentro.get(m.costCenterId)?.name ?? null : null },
          projeto: { nome: m.projectId ? mProjeto.get(m.projectId)?.name ?? null : null },
        };
      })
    ),
    limitada,
  };
}
