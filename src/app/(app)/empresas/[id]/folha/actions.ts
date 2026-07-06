"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PayrollStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";

export type PayrollCompetencyState = { error: string } | null;

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

async function assertCompanyInScope(companyId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true },
  });
  return !!company;
}

export async function abrirCompetencia(_prev: PayrollCompetencyState, form: FormData): Promise<PayrollCompetencyState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para abrir competência." };
  if (!(await canViewSensitiveField(ctx, "SALARIO"))) {
    return { error: "Sem permissão para dados de folha (salário)." };
  }

  const companyId = form.get("companyId") as string;
  if (!companyId || !(await assertCompanyInScope(companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const month = parseInt((form.get("month") as string) ?? "");
  const year = parseInt((form.get("year") as string) ?? "");
  if (!month || month < 1 || month > 12) return { error: "Mês inválido." };
  if (!year || year < 2000) return { error: "Ano inválido." };

  const prisma = getPrisma();
  let id: string;
  try {
    const competency = await prisma.payrollCompetency.create({
      data: { tenantId: ctx.tenantId, companyId, month, year },
    });
    id = competency.id;
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Já existe uma competência para esse mês/ano nesta empresa." };
    console.error("[abrirCompetencia]", err);
    return { error: "Erro ao abrir competência." };
  }

  revalidatePath(`/empresas/${companyId}/folha`);
  redirect(`/empresas/${companyId}/folha/${id}`);
}

export async function atualizarStatusCompetencia(
  companyId: string,
  competencyId: string,
  _prev: PayrollCompetencyState,
  form: FormData
): Promise<PayrollCompetencyState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para atualizar a competência." };
  if (!(await assertCompanyInScope(companyId, ctx))) return { error: "Empresa fora do seu escopo." };

  const status = form.get("status") as PayrollStatus;
  if (!Object.values(PayrollStatus).includes(status)) return { error: "Status inválido." };

  const prisma = getPrisma();
  const existing = await prisma.payrollCompetency.findFirst({ where: { id: competencyId, tenantId: ctx.tenantId, companyId } });
  if (!existing) return { error: "Competência não encontrada." };

  await prisma.payrollCompetency.update({
    where: { id: competencyId },
    data: { status, closedAt: status === "PROCESSADO" ? new Date() : existing.closedAt },
  });

  revalidatePath(`/empresas/${companyId}/folha/${competencyId}`);
  return null;
}

export async function excluirCompetencia(companyId: string, competencyId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertCompanyInScope(companyId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.payrollCompetency.findFirst({ where: { id: competencyId, tenantId: ctx.tenantId, companyId } });
  if (!existing) return;

  try {
    await prisma.payrollCompetency.delete({ where: { id: competencyId } });
  } catch (err) {
    console.error("[excluirCompetencia]", err);
    return;
  }

  revalidatePath(`/empresas/${companyId}/folha`);
  redirect(`/empresas/${companyId}/folha`);
}
