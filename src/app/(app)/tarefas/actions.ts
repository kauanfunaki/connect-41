"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { serializeTaskWidgets, type TaskWidgetKey } from "@/lib/taskWidgets";
import type { ActionState } from "@/lib/actionState";

// Só SUPER_ADMIN configura a tela /tarefas: isto não é preferência de quem
// olha, é a definição do que conta como obrigação de um setor — e vale para
// todo mundo daquele setor. ADMIN de workspace fica de fora de propósito;
// se isso mudar, muda aqui e no gate da própria página (a action é a barreira
// real, o botão escondido é só cortesia).
function podeConfigurar(role: string): boolean {
  return role === "SUPER_ADMIN";
}

export async function salvarWidgetsSetor(
  sectorCode: string,
  keys: TaskWidgetKey[]
): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (!podeConfigurar(ctx.role)) return { error: "Só o super admin configura a tela de Tarefas." };
  if (!sectorCode) return { error: "Setor não informado." };

  const prisma = getPrisma();

  // Setor precisa existir no tenant — sem isso, um código digitado errado
  // criaria uma configuração órfã que nunca seria lida por ninguém.
  const setor = await prisma.sector.findFirst({
    where: { tenantId: ctx.tenantId, code: sectorCode },
    select: { id: true },
  });
  if (!setor) return { error: "Setor não encontrado neste workspace." };

  const widgets = serializeTaskWidgets(keys);

  try {
    await prisma.sectorTaskView.upsert({
      where: { tenantId_sectorCode: { tenantId: ctx.tenantId, sectorCode } },
      create: { tenantId: ctx.tenantId, sectorCode, widgets },
      update: { widgets },
    });
  } catch (err) {
    console.error("[salvarWidgetsSetor]", err);
    return { error: "Erro ao salvar a configuração da tela de Tarefas." };
  }

  revalidatePath("/tarefas");
  return null;
}

// Volta o setor ao padrão apagando a linha — ausência de configuração é lida
// como "todos os blocos do catálogo", inclusive os que forem lançados depois.
export async function restaurarWidgetsSetor(sectorCode: string): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (!podeConfigurar(ctx.role)) return { error: "Só o super admin configura a tela de Tarefas." };

  try {
    const prisma = getPrisma();
    await prisma.sectorTaskView.deleteMany({ where: { tenantId: ctx.tenantId, sectorCode } });
  } catch (err) {
    console.error("[restaurarWidgetsSetor]", err);
    return { error: "Erro ao restaurar a tela de Tarefas." };
  }

  revalidatePath("/tarefas");
  return null;
}
