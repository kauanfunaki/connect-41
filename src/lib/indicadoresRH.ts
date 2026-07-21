// Cálculo dos KPIs de RH — extraído de indicadores-rh/page.tsx pra ser
// reaproveitado também pelo endpoint de exportação (PDF/Excel), evitando
// duplicar as ~15 queries em dois lugares.
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";

export type IndicadorCard = { label: string; value: string; hint?: string };

function fmtInt(n: number): string {
  return Number(n).toLocaleString("pt-BR");
}

function fmtDecimal(n: number, digits = 1): string {
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtCurrency(v: unknown): string {
  return v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export async function getIndicadoresRH(ctx: AuthContext): Promise<IndicadorCard[]> {
  const prisma = getPrisma();
  const canViewSalary = await canViewSensitiveField(ctx, "SALARIO");

  const now = new Date();
  const last30 = new Date(now);
  last30.setDate(last30.getDate() - 30);
  const last90 = new Date(now);
  last90.setDate(last90.getDate() - 90);

  const [
    headcount,
    admissoes,
    demissoes,
    absencesLast30,
    overtimeLast30,
    vagasAbertas,
    candidaturasTotal,
    candidaturasContratado,
    candidaturasReprovado,
    candidaturasResolvidasComData,
    treinamentosRealizados,
    evaluationAvg,
    vacations,
  ] = await Promise.all([
    prisma.person.count({ where: { tenantId: ctx.tenantId, type: "COLABORADOR", active: true, employmentStatus: { not: "DESLIGADO" } } }),
    prisma.person.count({ where: { tenantId: ctx.tenantId, type: "COLABORADOR", admissionDate: { gte: last30 } } }),
    prisma.termination.count({ where: { tenantId: ctx.tenantId, status: "FINALIZADO", finalizedAt: { gte: last30 } } }),
    // status REPROVADO = solicitação de ausência negada — não é dia
    // efetivamente perdido, então não pode entrar na métrica.
    prisma.absence.aggregate({ where: { tenantId: ctx.tenantId, startDate: { gte: last30 }, status: { not: "REPROVADO" } }, _sum: { lostDays: true } }),
    prisma.overtimeEntry.aggregate({ where: { tenantId: ctx.tenantId, date: { gte: last30 } }, _sum: { overtimeHours: true } }),
    prisma.vaga.count({ where: { tenantId: ctx.tenantId, status: "ABERTA" } }),
    prisma.candidatura.count({ where: { tenantId: ctx.tenantId } }),
    prisma.candidatura.count({ where: { tenantId: ctx.tenantId, status: "CONTRATADO" } }),
    prisma.candidatura.count({ where: { tenantId: ctx.tenantId, status: "REPROVADO" } }),
    prisma.candidatura.findMany({
      where: { tenantId: ctx.tenantId, status: "CONTRATADO", hiredAt: { not: null } },
      select: { createdAt: true, hiredAt: true },
    }),
    prisma.trainingParticipant.count({ where: { tenantId: ctx.tenantId, status: { in: ["REALIZADO", "CONCLUIDO"] }, createdAt: { gte: last90 } } }),
    prisma.evaluation.aggregate({ where: { tenantId: ctx.tenantId }, _avg: { averageScore: true } }),
    prisma.vacation.findMany({
      where: { tenantId: ctx.tenantId, status: { notIn: ["CONCLUIDA", "CANCELADA"] } },
      select: { concessivePeriodEnd: true },
    }),
  ]);

  const vagasCount = await prisma.vaga.count({ where: { tenantId: ctx.tenantId } });
  const candidatosPorVaga = vagasCount > 0 ? fmtDecimal(candidaturasTotal / vagasCount, 1) : "—";

  const resolvidas = candidaturasContratado + candidaturasReprovado;
  const taxaAprovacao = resolvidas > 0 ? fmtInt(Math.round((candidaturasContratado / resolvidas) * 100)) : "—";
  const taxaReprovacao = resolvidas > 0 ? fmtInt(Math.round((candidaturasReprovado / resolvidas) * 100)) : "—";

  const tempoMedioContratacaoDias = candidaturasResolvidasComData.length > 0
    ? Math.round(
        candidaturasResolvidasComData.reduce((sum, c) => sum + (c.hiredAt!.getTime() - c.createdAt.getTime()), 0)
        / candidaturasResolvidasComData.length
        / (1000 * 60 * 60 * 24)
      )
    : null;

  const feriasVencidas = vacations.filter((v) => v.concessivePeriodEnd && v.concessivePeriodEnd < now).length;
  const feriasAVencer = vacations.length - feriasVencidas;

  const turnoverPct = fmtDecimal(headcount > 0 ? (demissoes / headcount) * 100 : 0, 1);

  let custoFolha: unknown = null;
  let custoBeneficios: unknown = null;
  if (canViewSalary) {
    const [folhaAgg, beneficiosAgg] = await Promise.all([
      prisma.payrollEntry.aggregate({
        where: { tenantId: ctx.tenantId, competency: { month: now.getMonth() + 1, year: now.getFullYear() } },
        _sum: { grossSalary: true },
      }),
      prisma.benefitAssignment.aggregate({
        where: { tenantId: ctx.tenantId, status: "ATIVO" },
        _sum: { companyValue: true },
      }),
    ]);
    custoFolha = folhaAgg._sum.grossSalary ?? 0;
    custoBeneficios = beneficiosAgg._sum.companyValue ?? 0;
  }

  const cards: IndicadorCard[] = [
    { label: "Headcount", value: fmtInt(headcount), hint: "Colaboradores ativos" },
    { label: "Admissões (30 dias)", value: fmtInt(admissoes) },
    { label: "Demissões (30 dias)", value: fmtInt(demissoes) },
    { label: "Turnover", value: `${turnoverPct}%`, hint: "Demissões / Headcount" },
    { label: "Absenteísmo (30 dias)", value: `${fmtInt(absencesLast30._sum.lostDays ?? 0)} dias`, hint: "Dias perdidos" },
    { label: "Horas Extras (30 dias)", value: `${fmtDecimal(Number(overtimeLast30._sum.overtimeHours ?? 0), 1)}h` },
    { label: "Férias Vencidas", value: fmtInt(feriasVencidas) },
    { label: "Férias a Vencer", value: fmtInt(feriasAVencer) },
    { label: "Vagas Abertas", value: fmtInt(vagasAbertas) },
    { label: "Candidatos por Vaga", value: candidatosPorVaga },
    { label: "Taxa de Aprovação", value: taxaAprovacao === "—" ? "—" : `${taxaAprovacao}%` },
    { label: "Taxa de Reprovação", value: taxaReprovacao === "—" ? "—" : `${taxaReprovacao}%` },
    { label: "Tempo Médio de Contratação", value: tempoMedioContratacaoDias != null ? `${fmtInt(tempoMedioContratacaoDias)} dias` : "—" },
    { label: "Treinamentos Realizados (90 dias)", value: fmtInt(treinamentosRealizados) },
    { label: "Desempenho Médio", value: evaluationAvg._avg.averageScore != null ? fmtDecimal(Number(evaluationAvg._avg.averageScore), 2) : "—" },
  ];

  if (canViewSalary) {
    cards.push(
      { label: "Custo de Folha (mês atual)", value: fmtCurrency(custoFolha) },
      { label: "Custo de Benefícios (ativos)", value: fmtCurrency(custoBeneficios) }
    );
  }

  return cards;
}
