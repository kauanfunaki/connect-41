"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";

export async function marcarNotificacaoLida(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;

  const prisma = getPrisma();
  await prisma.notification.updateMany({
    where: { id, tenantId: ctx.tenantId, userId: ctx.userId },
    data: { read: true },
  });

  revalidatePath("/notificacoes");
}

export async function marcarTodasLidas(): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;

  const prisma = getPrisma();
  await prisma.notification.updateMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, read: false },
    data: { read: true },
  });

  revalidatePath("/notificacoes");
}
