"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { serializeHomeWidgets, type HomeWidgetKey } from "@/lib/homeWidgets";
import type { ActionState } from "@/lib/actionState";

// Salva quais blocos da Home o usuário quer ver e em que ordem. Preferência é
// pessoal e não concede acesso a nada — a Home continua filtrando widget
// restrito por papel — então basta estar autenticado.
export async function salvarWidgetsHome(keys: HomeWidgetKey[]): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };

  const homeWidgets = serializeHomeWidgets(keys);

  try {
    const prisma = getPrisma();
    await prisma.userPreference.upsert({
      where: { userId: ctx.userId },
      create: { userId: ctx.userId, tenantId: ctx.tenantId, homeWidgets },
      update: { homeWidgets },
    });
  } catch (err) {
    console.error("[salvarWidgetsHome]", err);
    return { error: "Erro ao salvar a personalização da Home." };
  }

  revalidatePath("/home");
  return null;
}

// Volta pro padrão apagando a coluna — homeWidgets nulo é lido como "tudo
// visível na ordem do catálogo", inclusive widgets lançados depois.
export async function restaurarWidgetsHome(): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };

  try {
    const prisma = getPrisma();
    await prisma.userPreference.upsert({
      where: { userId: ctx.userId },
      create: { userId: ctx.userId, tenantId: ctx.tenantId, homeWidgets: null },
      update: { homeWidgets: null },
    });
  } catch (err) {
    console.error("[restaurarWidgetsHome]", err);
    return { error: "Erro ao restaurar a Home." };
  }

  revalidatePath("/home");
  return null;
}
