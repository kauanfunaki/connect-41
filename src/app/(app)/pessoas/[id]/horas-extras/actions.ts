"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { DayType, OvertimeStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";

export type OvertimeState = { error: string } | null;

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

export async function criarHoraExtra(
  personId: string,
  _prev: OvertimeState,
  form: FormData
): Promise<OvertimeState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para lançar horas extras." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const dateRaw = pick(form, "date");
  if (!dateRaw) return { error: "Informe a data." };
  const dayType = form.get("dayType") as DayType;
  if (!Object.values(DayType).includes(dayType)) return { error: "Tipo de dia inválido." };

  const prisma = getPrisma();
  try {
    await prisma.overtimeEntry.create({
      data: {
        tenantId: ctx.tenantId,
        personId,
        date: new Date(dateRaw),
        expectedShift: pick(form, "expectedShift"),
        owedHours: pick(form, "owedHours"),
        workedHours: pick(form, "workedHours"),
        overtimeHours: pick(form, "overtimeHours"),
        dayType,
        additionalRate: pick(form, "additionalRate"),
        justification: pick(form, "justification"),
        status: OvertimeStatus.PENDENTE_APROVACAO,
      },
    });
  } catch (err) {
    console.error("[criarHoraExtra]", err);
    return { error: "Erro ao lançar horas extras." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function atualizarHoraExtra(
  personId: string,
  entryId: string,
  _prev: OvertimeState,
  form: FormData
): Promise<OvertimeState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para atualizar lançamentos." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const status = form.get("status") as OvertimeStatus;
  if (!Object.values(OvertimeStatus).includes(status)) return { error: "Status inválido." };

  const prisma = getPrisma();
  const existing = await prisma.overtimeEntry.findFirst({ where: { id: entryId, tenantId: ctx.tenantId, personId } });
  if (!existing) return { error: "Lançamento não encontrado." };

  try {
    await prisma.overtimeEntry.update({ where: { id: entryId }, data: { status } });
  } catch (err) {
    console.error("[atualizarHoraExtra]", err);
    return { error: "Erro ao atualizar lançamento." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function excluirHoraExtra(personId: string, entryId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertPersonInScope(personId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.overtimeEntry.findFirst({ where: { id: entryId, tenantId: ctx.tenantId, personId } });
  if (!existing) return;

  try {
    await prisma.overtimeEntry.delete({ where: { id: entryId } });
  } catch (err) {
    console.error("[excluirHoraExtra]", err);
    return;
  }

  revalidatePath(`/pessoas/${personId}`);
}
