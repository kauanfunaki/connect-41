"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

export type FilialState = { error: string } | null;

export async function criarFilial(_prev: FilialState, form: FormData): Promise<FilialState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para criar filiais." };

  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome da filial é obrigatório" };

  const prisma = getPrisma();
  try {
    const maxOrder = await prisma.branch.aggregate({ where: { tenantId: ctx.tenantId }, _max: { order: true } });
    await prisma.branch.create({
      data: { tenantId: ctx.tenantId, name, order: (maxOrder._max.order ?? -1) + 1 },
    });
  } catch (err) {
    console.error("[criarFilial]", err);
    return { error: "Erro ao criar filial. Tente novamente." };
  }

  revalidatePath("/admin/filiais");
  redirect("/admin/filiais");
}

export async function atualizarFilial(_prev: FilialState, form: FormData): Promise<FilialState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para editar filiais." };

  const id = form.get("id") as string;
  const name = (form.get("name") as string)?.trim();
  const active = form.get("active") === "on";
  const orderRaw = (form.get("order") as string)?.trim();

  if (!name) return { error: "Nome da filial é obrigatório" };

  const prisma = getPrisma();
  const existing = await prisma.branch.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return { error: "Filial não encontrada." };

  try {
    await prisma.branch.update({
      where: { id },
      data: { name, active, order: orderRaw ? parseInt(orderRaw) : existing.order },
    });
  } catch (err) {
    console.error("[atualizarFilial]", err);
    return { error: "Erro ao atualizar filial." };
  }

  revalidatePath("/admin/filiais");
  redirect("/admin/filiais");
}
