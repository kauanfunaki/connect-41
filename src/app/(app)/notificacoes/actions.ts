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

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function salvarPushSubscription(sub: PushSubscriptionInput): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Assinatura inválida." };

  const prisma = getPrisma();
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    update: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  });
  return null;
}

export async function removerPushSubscription(endpoint: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !endpoint) return;

  const prisma = getPrisma();
  await prisma.pushSubscription.deleteMany({ where: { endpoint, tenantId: ctx.tenantId } });
}
