"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PayrollStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";

export type PayrollEntryState = { error: string } | null;

function pick(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}
function pickInt(form: FormData, key: string): number | null {
  const raw = pick(form, key);
  return raw ? parseInt(raw) : null;
}

async function assertCompetencyInScope(companyId: string, competencyId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const company = await prisma.company.findFirst({ where: { id: companyId, ...(await scopedCompanyWhere(ctx)) }, select: { id: true } });
  if (!company) return false;
  const competency = await prisma.payrollCompetency.findFirst({ where: { id: competencyId, tenantId: ctx.tenantId, companyId } });
  return !!competency;
}

export async function lancarEvento(
  companyId: string,
  competencyId: string,
  _prev: PayrollEntryState,
  form: FormData
): Promise<PayrollEntryState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para lançar eventos de folha." };
  if (!(await canViewSensitiveField(ctx, "SALARIO"))) {
    return { error: "Sem permissão para dados de folha (salário)." };
  }
  if (!(await assertCompetencyInScope(companyId, competencyId, ctx))) {
    return { error: "Competência não encontrada ou fora do seu escopo." };
  }

  const personId = form.get("personId") as string;
  const grossSalaryRaw = pick(form, "grossSalary");
  if (!personId) return { error: "Selecione um colaborador." };
  if (!grossSalaryRaw) return { error: "Informe o salário bruto." };

  const prisma = getPrisma();
  try {
    await prisma.payrollEntry.upsert({
      where: { competencyId_personId: { competencyId, personId } },
      create: {
        tenantId: ctx.tenantId,
        competencyId,
        personId,
        grossSalary: grossSalaryRaw,
        workedDays: pickInt(form, "workedDays"),
        vacationDays: pickInt(form, "vacationDays"),
        thirteenthSalary: pick(form, "thirteenthSalary"),
        familyAllowance: pick(form, "familyAllowance"),
        absenceDays: pickInt(form, "absenceDays"),
        missedDays: pickInt(form, "missedDays"),
        overtimeHours: pick(form, "overtimeHours"),
        nightShiftAllowance: pick(form, "nightShiftAllowance"),
        hazardPay: pick(form, "hazardPay"),
        unhealthyPay: pick(form, "unhealthyPay"),
        benefitsTotal: pick(form, "benefitsTotal"),
        deductions: pick(form, "deductions"),
        notes: pick(form, "notes"),
      },
      update: {
        grossSalary: grossSalaryRaw,
        workedDays: pickInt(form, "workedDays"),
        vacationDays: pickInt(form, "vacationDays"),
        thirteenthSalary: pick(form, "thirteenthSalary"),
        familyAllowance: pick(form, "familyAllowance"),
        absenceDays: pickInt(form, "absenceDays"),
        missedDays: pickInt(form, "missedDays"),
        overtimeHours: pick(form, "overtimeHours"),
        nightShiftAllowance: pick(form, "nightShiftAllowance"),
        hazardPay: pick(form, "hazardPay"),
        unhealthyPay: pick(form, "unhealthyPay"),
        benefitsTotal: pick(form, "benefitsTotal"),
        deductions: pick(form, "deductions"),
        notes: pick(form, "notes"),
      },
    });
  } catch (err) {
    console.error("[lancarEvento]", err);
    return { error: "Erro ao lançar evento." };
  }

  revalidatePath(`/empresas/${companyId}/folha/${competencyId}`);
  return null;
}

export async function atualizarStatusLancamento(
  companyId: string,
  competencyId: string,
  entryId: string,
  _prev: PayrollEntryState,
  form: FormData
): Promise<PayrollEntryState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para atualizar o lançamento." };
  if (!(await assertCompetencyInScope(companyId, competencyId, ctx))) return { error: "Competência fora do seu escopo." };

  const status = form.get("status") as PayrollStatus;
  if (!Object.values(PayrollStatus).includes(status)) return { error: "Status inválido." };

  const prisma = getPrisma();
  const existing = await prisma.payrollEntry.findFirst({ where: { id: entryId, tenantId: ctx.tenantId, competencyId } });
  if (!existing) return { error: "Lançamento não encontrado." };

  await prisma.payrollEntry.update({ where: { id: entryId }, data: { status } });
  revalidatePath(`/empresas/${companyId}/folha/${competencyId}`);
  return null;
}

export async function excluirLancamento(companyId: string, competencyId: string, entryId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertCompetencyInScope(companyId, competencyId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.payrollEntry.findFirst({ where: { id: entryId, tenantId: ctx.tenantId, competencyId } });
  if (!existing) return;

  try {
    await prisma.payrollEntry.delete({ where: { id: entryId } });
  } catch (err) {
    console.error("[excluirLancamento]", err);
    return;
  }

  revalidatePath(`/empresas/${companyId}/folha/${competencyId}`);
}
