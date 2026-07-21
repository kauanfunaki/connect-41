"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { VacationStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { COMMITTED_VACATION_STATUSES, findScheduleConflictsForVacationPeriod } from "@/lib/scheduleVacationConflict";
import { formatCalendarDate } from "@/lib/format";

export type VacationState = { error: string } | null;

function pick(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}

function pickDate(form: FormData, key: string): Date | null {
  const raw = pick(form, key);
  return raw ? new Date(raw) : null;
}

async function assertPersonInScope(personId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id: personId, ...(await scopedPersonWhere(ctx)) },
    select: { id: true },
  });
  return !!person;
}

export async function criarFerias(
  personId: string,
  _prev: VacationState,
  form: FormData
): Promise<VacationState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para programar férias." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const acquisitivePeriodStart = pickDate(form, "acquisitivePeriodStart");
  const acquisitivePeriodEnd = pickDate(form, "acquisitivePeriodEnd");
  if (!acquisitivePeriodStart || !acquisitivePeriodEnd) {
    return { error: "Informe o período aquisitivo." };
  }

  const prisma = getPrisma();
  try {
    await prisma.vacation.create({
      data: {
        tenantId: ctx.tenantId,
        personId,
        acquisitivePeriodStart,
        acquisitivePeriodEnd,
        concessivePeriodStart: pickDate(form, "concessivePeriodStart"),
        concessivePeriodEnd: pickDate(form, "concessivePeriodEnd"),
        days: parseInt(pick(form, "days") ?? "30") || 30,
        cashAllowance: form.get("cashAllowance") === "true",
        installment: form.get("installment") === "true",
        notes: pick(form, "notes"),
      },
    });
  } catch (err) {
    console.error("[criarFerias]", err);
    return { error: "Erro ao programar férias." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function atualizarFerias(
  personId: string,
  vacationId: string,
  _prev: VacationState,
  form: FormData
): Promise<VacationState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para atualizar férias." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const status = form.get("status") as VacationStatus;
  if (!Object.values(VacationStatus).includes(status)) {
    return { error: "Status inválido." };
  }

  const prisma = getPrisma();
  const existing = await prisma.vacation.findFirst({ where: { id: vacationId, tenantId: ctx.tenantId, personId } });
  if (!existing) return { error: "Registro de férias não encontrado." };

  const effectiveStartDate = pickDate(form, "startDate") ?? existing.startDate;
  const effectiveReturnDate = pickDate(form, "returnDate") ?? existing.returnDate;

  // Ao confirmar férias (aprovada/programada/em gozo), nenhuma escala de
  // trabalho já lançada pode sobrar dentro do período — precisa ser
  // cancelada manualmente antes, não é sobrescrita silenciosamente.
  if (COMMITTED_VACATION_STATUSES.includes(status) && effectiveStartDate && effectiveReturnDate) {
    const conflicts = await findScheduleConflictsForVacationPeriod(ctx.tenantId, personId, effectiveStartDate, effectiveReturnDate);
    if (conflicts.length > 0) {
      const dates = conflicts.map((c) => formatCalendarDate(c.date)).join(", ");
      return { error: `Já existe escala de trabalho lançada dentro do período de férias (${dates}) — cancele essas escalas antes de confirmar.` };
    }
  }

  try {
    await prisma.vacation.update({
      where: { id: vacationId },
      data: {
        status,
        startDate: effectiveStartDate,
        returnDate: effectiveReturnDate,
      },
    });

    if (status === "EM_GOZO") {
      await prisma.person.update({ where: { id: personId }, data: { employmentStatus: "EM_FERIAS" } });
    } else if (status === "CONCLUIDA") {
      await prisma.person.update({ where: { id: personId }, data: { employmentStatus: "ATIVO" } });
    }
  } catch (err) {
    console.error("[atualizarFerias]", err);
    return { error: "Erro ao atualizar férias." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function excluirFerias(personId: string, vacationId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertPersonInScope(personId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.vacation.findFirst({ where: { id: vacationId, tenantId: ctx.tenantId, personId } });
  if (!existing) return;

  try {
    await prisma.vacation.delete({ where: { id: vacationId } });
  } catch (err) {
    console.error("[excluirFerias]", err);
    return;
  }

  revalidatePath(`/pessoas/${personId}`);
}
