"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";

export type TrainingState = { error: string } | null;

function pick(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}

export async function criarTreinamento(_prev: TrainingState, form: FormData): Promise<TrainingState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para criar treinamentos." };

  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome do treinamento é obrigatório" };

  const prisma = getPrisma();
  let id: string;
  try {
    const training = await prisma.training.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        description: pick(form, "description"),
        workloadHours: pick(form, "workloadHours"),
        validityMonths: pick(form, "validityMonths") ? parseInt(pick(form, "validityMonths")!) : null,
      },
    });
    id = training.id;
  } catch (err) {
    console.error("[criarTreinamento]", err);
    return { error: "Erro ao criar treinamento." };
  }

  redirect(`/treinamentos/${id}`);
}

export async function atualizarTreinamento(_prev: TrainingState, form: FormData): Promise<TrainingState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar treinamentos." };

  const id = form.get("id") as string;
  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome do treinamento é obrigatório" };

  const prisma = getPrisma();
  const existing = await prisma.training.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return { error: "Treinamento não encontrado." };

  try {
    await prisma.training.update({
      where: { id },
      data: {
        name,
        description: pick(form, "description"),
        workloadHours: pick(form, "workloadHours"),
        validityMonths: pick(form, "validityMonths") ? parseInt(pick(form, "validityMonths")!) : null,
      },
    });
  } catch (err) {
    console.error("[atualizarTreinamento]", err);
    return { error: "Erro ao atualizar treinamento." };
  }

  revalidatePath(`/treinamentos/${id}`);
  redirect(`/treinamentos/${id}`);
}

export async function excluirTreinamento(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;

  const prisma = getPrisma();
  const existing = await prisma.training.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;

  try {
    await prisma.training.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirTreinamento]", err);
    return;
  }

  revalidatePath("/treinamentos");
  redirect("/treinamentos");
}
