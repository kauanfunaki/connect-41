"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { ScheduleStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { findVacationConflictForDate } from "@/lib/scheduleVacationConflict";
import { formatCalendarDate } from "@/lib/format";

export type ScheduleState = { error: string } | null;

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

export async function criarEscala(
  personId: string,
  _prev: ScheduleState,
  form: FormData
): Promise<ScheduleState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para montar escala." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const dateRaw = pick(form, "date");
  if (!dateRaw) return { error: "Informe a data." };
  const date = new Date(dateRaw);
  const dayOff = form.get("dayOff") === "true";
  const isHoliday = form.get("isHoliday") === "true";

  // Só um dia de trabalho de verdade pode conflitar com férias — folga e
  // feriado não representam convocação.
  if (!dayOff && !isHoliday) {
    const conflict = await findVacationConflictForDate(ctx.tenantId, personId, date);
    if (conflict) {
      return {
        error: `Colaborador está de férias aprovadas de ${formatCalendarDate(conflict.startDate)} a ${formatCalendarDate(conflict.returnDate)} — não é possível lançar escala de trabalho nessa data.`,
      };
    }
  }

  const prisma = getPrisma();
  try {
    await prisma.scheduleEntry.create({
      data: {
        tenantId: ctx.tenantId,
        personId,
        date,
        shiftId: pick(form, "shiftId"),
        dayOff,
        isHoliday,
        notes: pick(form, "notes"),
      },
    });
  } catch (err) {
    console.error("[criarEscala]", err);
    return { error: "Erro ao montar escala." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function atualizarEscala(
  personId: string,
  entryId: string,
  _prev: ScheduleState,
  form: FormData
): Promise<ScheduleState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para atualizar escala." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const status = form.get("status") as ScheduleStatus;
  if (!Object.values(ScheduleStatus).includes(status)) return { error: "Status inválido." };

  const prisma = getPrisma();
  const existing = await prisma.scheduleEntry.findFirst({ where: { id: entryId, tenantId: ctx.tenantId, personId } });
  if (!existing) return { error: "Registro não encontrado." };

  try {
    await prisma.scheduleEntry.update({ where: { id: entryId }, data: { status } });
  } catch (err) {
    console.error("[atualizarEscala]", err);
    return { error: "Erro ao atualizar escala." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function excluirEscala(personId: string, entryId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertPersonInScope(personId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.scheduleEntry.findFirst({ where: { id: entryId, tenantId: ctx.tenantId, personId } });
  if (!existing) return;

  try {
    await prisma.scheduleEntry.delete({ where: { id: entryId } });
  } catch (err) {
    console.error("[excluirEscala]", err);
    return;
  }

  revalidatePath(`/pessoas/${personId}`);
}
