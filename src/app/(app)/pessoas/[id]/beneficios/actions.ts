"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { BenefitStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";

export type BenefitAssignmentState = { error: string } | null;

function pick(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}

async function assertPersonInScope(personId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id: personId, ...(await scopedPersonWhere(ctx)) },
    select: { id: true },
  });
  return !!person;
}

export async function vincularBeneficio(
  personId: string,
  _prev: BenefitAssignmentState,
  form: FormData
): Promise<BenefitAssignmentState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para vincular benefícios." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const benefitId = form.get("benefitId") as string;
  const startDateRaw = pick(form, "startDate");
  if (!benefitId) return { error: "Selecione um benefício." };
  if (!startDateRaw) return { error: "Informe a data de início." };

  const prisma = getPrisma();
  try {
    await prisma.benefitAssignment.create({
      data: {
        tenantId: ctx.tenantId,
        personId,
        benefitId,
        companyValue: pick(form, "companyValue"),
        discountValue: pick(form, "discountValue"),
        startDate: new Date(startDateRaw),
        notes: pick(form, "notes"),
      },
    });
  } catch (err) {
    console.error("[vincularBeneficio]", err);
    return { error: "Erro ao vincular benefício." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function atualizarBeneficioAssignment(
  personId: string,
  assignmentId: string,
  _prev: BenefitAssignmentState,
  form: FormData
): Promise<BenefitAssignmentState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para atualizar benefícios." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const status = form.get("status") as BenefitStatus;
  if (!Object.values(BenefitStatus).includes(status)) return { error: "Status inválido." };

  const prisma = getPrisma();
  const existing = await prisma.benefitAssignment.findFirst({ where: { id: assignmentId, tenantId: ctx.tenantId, personId } });
  if (!existing) return { error: "Vínculo não encontrado." };

  const endDateRaw = pick(form, "endDate");
  try {
    await prisma.benefitAssignment.update({
      where: { id: assignmentId },
      data: { status, endDate: endDateRaw ? new Date(endDateRaw) : existing.endDate },
    });
  } catch (err) {
    console.error("[atualizarBeneficioAssignment]", err);
    return { error: "Erro ao atualizar vínculo." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function removerBeneficioAssignment(personId: string, assignmentId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertPersonInScope(personId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.benefitAssignment.findFirst({ where: { id: assignmentId, tenantId: ctx.tenantId, personId } });
  if (!existing) return;

  try {
    await prisma.benefitAssignment.delete({ where: { id: assignmentId } });
  } catch (err) {
    console.error("[removerBeneficioAssignment]", err);
    return;
  }

  revalidatePath(`/pessoas/${personId}`);
}
