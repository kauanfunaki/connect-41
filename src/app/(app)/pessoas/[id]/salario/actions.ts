"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";

export type SalaryChangeState = { error: string } | null;

export async function registrarReajuste(
  personId: string,
  _prev: SalaryChangeState,
  form: FormData
): Promise<SalaryChangeState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para registrar reajustes." };
  if (!(await canViewSensitiveField(ctx, "SALARIO"))) {
    return { error: "Sem permissão para editar dados salariais." };
  }

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({ where: { id: personId, ...(await scopedPersonWhere(ctx)) } });
  if (!person) return { error: "Pessoa não encontrada ou fora do seu escopo." };

  const newSalaryRaw = (form.get("newSalary") as string)?.trim();
  const effectiveDateRaw = (form.get("effectiveDate") as string)?.trim();
  const reason = (form.get("reason") as string)?.trim() || null;
  const cargoId = (form.get("cargoId") as string)?.trim() || null;

  if (!newSalaryRaw) return { error: "Informe o novo salário." };
  if (!effectiveDateRaw) return { error: "Informe a data do reajuste." };

  const newSalary = Number(newSalaryRaw);
  const previousSalary = person.currentSalary != null ? Number(person.currentSalary) : null;
  const changePercent = previousSalary && previousSalary > 0
    ? Number((((newSalary - previousSalary) / previousSalary) * 100).toFixed(2))
    : null;

  try {
    await prisma.salaryChange.create({
      data: {
        tenantId: ctx.tenantId,
        personId,
        previousSalary: previousSalary != null ? previousSalary.toString() : null,
        newSalary: newSalary.toString(),
        changePercent: changePercent != null ? changePercent.toString() : null,
        cargoId,
        reason,
        effectiveDate: new Date(effectiveDateRaw),
      },
    });

    await prisma.person.update({
      where: { id: personId },
      data: {
        currentSalary: newSalary.toString(),
        ...(cargoId ? { cargoId } : {}),
      },
    });
  } catch (err) {
    console.error("[registrarReajuste]", err);
    return { error: "Erro ao registrar reajuste." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}
