// Conferência assistida de folha — anomalia estatística pura, sem IA/LLM.
// Compara os lançamentos da competência com o histórico do colaborador e com o
// quadro ativo da empresa. É apontamento pra revisão humana, nunca decisão:
// a regra trabalhista de cada empresa-cliente fica com o próprio DP.
import { getPrisma } from "@/lib/prisma";

const SALARY_DEVIATION_PCT = 10;

export type PayrollAnomaly = {
  personId: string;
  personName: string;
  kind: "SALARIO_DIVERGENTE" | "SEM_LANCAMENTO" | "PRIMEIRO_LANCAMENTO" | "DESCONTO_ALTO";
  detail: string;
};

export async function detectPayrollAnomalies(input: {
  tenantId: string;
  companyId: string;
  competencyId: string;
}): Promise<PayrollAnomaly[]> {
  const prisma = getPrisma();
  const { tenantId, companyId, competencyId } = input;

  const competency = await prisma.payrollCompetency.findFirst({
    where: { id: competencyId, tenantId, companyId },
    include: { entries: { include: { person: { select: { id: true, name: true } } } } },
  });
  if (!competency) return [];

  const personIds = competency.entries.map((e) => e.personId);

  const [previousEntries, activePeople] = await Promise.all([
    // Último lançamento anterior de cada colaborador (competências mais antigas
    // desta ou de outra empresa do tenant — salário acompanha a pessoa).
    prisma.payrollEntry.findMany({
      where: {
        tenantId,
        personId: { in: personIds.length > 0 ? personIds : ["-"] },
        competencyId: { not: competencyId },
        competency: {
          OR: [
            { year: { lt: competency.year } },
            { year: competency.year, month: { lt: competency.month } },
          ],
        },
      },
      orderBy: [{ competency: { year: "desc" } }, { competency: { month: "desc" } }],
      select: { personId: true, grossSalary: true, deductions: true },
    }),
    prisma.person.findMany({
      where: {
        tenantId,
        currentCompanyId: companyId,
        type: "COLABORADOR",
        active: true,
        employmentStatus: { in: ["ATIVO"] },
      },
      select: { id: true, name: true },
    }),
  ]);

  // findMany ordenado desc: o primeiro registro de cada personId é o mais recente.
  const lastByPerson = new Map<string, { grossSalary: unknown; deductions: unknown }>();
  for (const e of previousEntries) {
    if (!lastByPerson.has(e.personId)) lastByPerson.set(e.personId, e);
  }

  const anomalies: PayrollAnomaly[] = [];

  for (const entry of competency.entries) {
    const prev = lastByPerson.get(entry.personId);
    const gross = Number(entry.grossSalary);

    if (!prev) {
      anomalies.push({
        personId: entry.personId,
        personName: entry.person.name,
        kind: "PRIMEIRO_LANCAMENTO",
        detail: "Primeiro lançamento de folha deste colaborador — conferir salário e verbas de admissão.",
      });
      continue;
    }

    const prevGross = Number(prev.grossSalary);
    if (prevGross > 0) {
      const deltaPct = ((gross - prevGross) / prevGross) * 100;
      if (Math.abs(deltaPct) >= SALARY_DEVIATION_PCT) {
        anomalies.push({
          personId: entry.personId,
          personName: entry.person.name,
          kind: "SALARIO_DIVERGENTE",
          detail: `Salário bruto ${deltaPct > 0 ? "subiu" : "caiu"} ${Number(Math.abs(deltaPct)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. última competência (R$ ${Number(prevGross).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} → R$ ${Number(gross).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`,
        });
      }
    }

    // Desconto acima de metade do bruto quase sempre é erro de digitação.
    const deductions = entry.deductions != null ? Number(entry.deductions) : 0;
    if (gross > 0 && deductions > gross * 0.5) {
      anomalies.push({
        personId: entry.personId,
        personName: entry.person.name,
        kind: "DESCONTO_ALTO",
        detail: `Descontos (R$ ${Number(deductions).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) passam de 50% do salário bruto.`,
      });
    }
  }

  const launched = new Set(personIds);
  for (const p of activePeople) {
    if (!launched.has(p.id)) {
      anomalies.push({
        personId: p.id,
        personName: p.name,
        kind: "SEM_LANCAMENTO",
        detail: "Colaborador ativo sem lançamento nesta competência.",
      });
    }
  }

  return anomalies;
}
