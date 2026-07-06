"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { ExameAdmissionalStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";

export type ExameState = { error: string } | null;

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

export async function criarExame(
  personId: string,
  _prev: ExameState,
  form: FormData
): Promise<ExameState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para registrar exames." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const prisma = getPrisma();
  try {
    await prisma.exameAdmissional.create({
      data: {
        tenantId: ctx.tenantId,
        personId,
        clinicName: pick(form, "clinicName"),
        scheduledAt: pickDate(form, "scheduledAt"),
        asoDueDate: pickDate(form, "asoDueDate"),
        notes: pick(form, "notes"),
        status: ExameAdmissionalStatus.SOLICITADO,
      },
    });
  } catch (err) {
    console.error("[criarExame]", err);
    return { error: "Erro ao registrar exame." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function atualizarExame(
  personId: string,
  exameId: string,
  _prev: ExameState,
  form: FormData
): Promise<ExameState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para atualizar exames." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const status = form.get("status") as ExameAdmissionalStatus;
  if (!Object.values(ExameAdmissionalStatus).includes(status)) {
    return { error: "Status inválido." };
  }

  const prisma = getPrisma();
  const existing = await prisma.exameAdmissional.findFirst({ where: { id: exameId, tenantId: ctx.tenantId, personId } });
  if (!existing) return { error: "Exame não encontrado." };

  try {
    await prisma.exameAdmissional.update({
      where: { id: exameId },
      data: {
        status,
        clinicName: pick(form, "clinicName") ?? existing.clinicName,
        scheduledAt: pickDate(form, "scheduledAt") ?? existing.scheduledAt,
        performedAt: pickDate(form, "performedAt") ?? existing.performedAt,
        asoDueDate: pickDate(form, "asoDueDate") ?? existing.asoDueDate,
        notes: pick(form, "notes") ?? existing.notes,
      },
    });
  } catch (err) {
    console.error("[atualizarExame]", err);
    return { error: "Erro ao atualizar exame." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function excluirExame(personId: string, exameId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertPersonInScope(personId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.exameAdmissional.findFirst({ where: { id: exameId, tenantId: ctx.tenantId, personId } });
  if (!existing) return;

  try {
    await prisma.exameAdmissional.delete({ where: { id: exameId } });
  } catch (err) {
    console.error("[excluirExame]", err);
    return;
  }

  revalidatePath(`/pessoas/${personId}`);
}
