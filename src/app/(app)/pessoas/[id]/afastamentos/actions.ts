"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { AbsenceType, AbsenceStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";

export type AbsenceState = { error: string } | null;

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

export async function criarAfastamento(
  personId: string,
  _prev: AbsenceState,
  form: FormData
): Promise<AbsenceState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para registrar afastamentos." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const type = form.get("type") as AbsenceType;
  if (!Object.values(AbsenceType).includes(type)) return { error: "Tipo de ausência inválido." };

  const startDate = pickDate(form, "startDate");
  if (!startDate) return { error: "Informe a data de início." };

  const canMedical = await canViewSensitiveField(ctx, "DADOS_MEDICOS");

  const prisma = getPrisma();
  try {
    await prisma.absence.create({
      data: {
        tenantId: ctx.tenantId,
        personId,
        type,
        startDate,
        returnDate: pickDate(form, "returnDate"),
        lostDays: pick(form, "lostDays") ? parseInt(pick(form, "lostDays")!) : null,
        lostHours: pick(form, "lostHours"),
        ...(canMedical
          ? {
              reason: pick(form, "reason"),
              shift: pick(form, "shift"),
              location: pick(form, "location"),
              professional: pick(form, "professional"),
            }
          : {}),
        notes: pick(form, "notes"),
      },
    });

    if (type === "AFASTAMENTO" || type === "LICENCA") {
      await prisma.person.update({ where: { id: personId }, data: { employmentStatus: "AFASTADO" } });
    }
  } catch (err) {
    console.error("[criarAfastamento]", err);
    return { error: "Erro ao registrar afastamento." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function atualizarAfastamento(
  personId: string,
  absenceId: string,
  _prev: AbsenceState,
  form: FormData
): Promise<AbsenceState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para atualizar afastamentos." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const status = form.get("status") as AbsenceStatus;
  if (!Object.values(AbsenceStatus).includes(status)) return { error: "Status inválido." };

  const prisma = getPrisma();
  const existing = await prisma.absence.findFirst({ where: { id: absenceId, tenantId: ctx.tenantId, personId } });
  if (!existing) return { error: "Registro não encontrado." };

  try {
    await prisma.absence.update({
      where: { id: absenceId },
      data: {
        status,
        returnDate: pickDate(form, "returnDate") ?? existing.returnDate,
      },
    });

    if (status === "CONCLUIDO") {
      await prisma.person.update({ where: { id: personId }, data: { employmentStatus: "ATIVO" } });
    }
  } catch (err) {
    console.error("[atualizarAfastamento]", err);
    return { error: "Erro ao atualizar afastamento." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function excluirAfastamento(personId: string, absenceId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertPersonInScope(personId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.absence.findFirst({ where: { id: absenceId, tenantId: ctx.tenantId, personId } });
  if (!existing) return;

  try {
    await prisma.absence.delete({ where: { id: absenceId } });
  } catch (err) {
    console.error("[excluirAfastamento]", err);
    return;
  }

  revalidatePath(`/pessoas/${personId}`);
}
