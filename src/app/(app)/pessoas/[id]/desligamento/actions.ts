"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { TerminationType, TerminationStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";

export type TerminationState = { error: string } | null;

async function assertPersonInScope(personId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id: personId, ...(await scopedPersonWhere(ctx)) },
    select: { id: true },
  });
  return !!person;
}

export async function criarDesligamento(
  personId: string,
  _prev: TerminationState,
  form: FormData
): Promise<TerminationState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para registrar desligamentos." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const type = form.get("type") as TerminationType;
  if (!Object.values(TerminationType).includes(type)) return { error: "Tipo de desligamento inválido." };
  const reason = (form.get("reason") as string)?.trim() || null;
  const notes = (form.get("notes") as string)?.trim() || null;

  const prisma = getPrisma();
  try {
    await prisma.termination.create({
      data: { tenantId: ctx.tenantId, personId, type, reason, notes },
    });
  } catch (err) {
    console.error("[criarDesligamento]", err);
    return { error: "Erro ao registrar desligamento." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function atualizarDesligamento(
  personId: string,
  terminationId: string,
  _prev: TerminationState,
  form: FormData
): Promise<TerminationState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para atualizar desligamentos." };
  if (!(await assertPersonInScope(personId, ctx))) {
    return { error: "Pessoa não encontrada ou fora do seu escopo." };
  }

  const status = form.get("status") as TerminationStatus;
  if (!Object.values(TerminationStatus).includes(status)) return { error: "Status inválido." };

  const prisma = getPrisma();
  const existing = await prisma.termination.findFirst({ where: { id: terminationId, tenantId: ctx.tenantId, personId } });
  if (!existing) return { error: "Registro não encontrado." };

  try {
    const finalizedAt = status === "FINALIZADO" ? new Date() : existing.finalizedAt;
    await prisma.termination.update({
      where: { id: terminationId },
      data: { status, finalizedAt },
    });

    if (status === "FINALIZADO") {
      await prisma.person.update({
        where: { id: personId },
        data: { employmentStatus: "DESLIGADO", dismissalDate: finalizedAt ?? new Date() },
      });
    }
  } catch (err) {
    console.error("[atualizarDesligamento]", err);
    return { error: "Erro ao atualizar desligamento." };
  }

  revalidatePath(`/pessoas/${personId}`);
  return null;
}

export async function excluirDesligamento(personId: string, terminationId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertPersonInScope(personId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.termination.findFirst({ where: { id: terminationId, tenantId: ctx.tenantId, personId } });
  if (!existing) return;

  try {
    await prisma.termination.delete({ where: { id: terminationId } });
  } catch (err) {
    console.error("[excluirDesligamento]", err);
    return;
  }

  revalidatePath(`/pessoas/${personId}`);
}
