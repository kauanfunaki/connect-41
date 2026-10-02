"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { ehAba, type AbaOuTodas } from "@/lib/notificacoes/catalogo";
import {
  consultarNotificacoes,
  naoLidasPorAba,
  ondeDasNotificacoes,
  type FiltrosDasNotificacoes,
  type NotificacaoNaTela,
} from "@/lib/notificacoes/consultas";

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

/** Todas como lidas — da aba, quando vem uma (o "Marcar todas" do sino e da central). */
export async function marcarTodasLidas(aba?: AbaOuTodas): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;

  const prisma = getPrisma();
  await prisma.notification.updateMany({
    where: { ...ondeDasNotificacoes({ tenantId: ctx.tenantId, userId: ctx.userId }, { aba: ehAba(aba) ? aba : "todas", status: "nao_lidas", q: "" }) },
    data: { read: true },
  });

  revalidatePath("/notificacoes");
}

// ─── Sino e central (02/10/2026) ───────────────────────────────────────────
//
// A lista do sino vem daqui, buscada ao abrir — até 02/10 ela vinha do layout,
// que não re-renderiza ao navegar, e envelhecia até recarregar a página.
// Toda ação filtra por tenantId + userId: ninguém mexe em notificação alheia.

/** Teto de ids por chamada: a seleção da central vem da página carregada. */
const MAX_IDS = 200;

function idsValidos(ids: unknown): string[] {
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, MAX_IDS) : [];
}

export async function listarNotificacoes(
  f: Partial<FiltrosDasNotificacoes>
): Promise<{ itens: NotificacaoNaTela[]; proximoCursor: string | null; contagens: Record<AbaOuTodas, number> }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { itens: [], proximoCursor: null, contagens: { todas: 0, para_mim: 0, clientes: 0, alertas: 0 } };
  const dono = { tenantId: ctx.tenantId, userId: ctx.userId };
  const [pagina, contagens] = await Promise.all([
    consultarNotificacoes(dono, {
      aba: ehAba(f.aba) ? f.aba : "todas",
      status: f.status === "nao_lidas" ? "nao_lidas" : "todas",
      q: typeof f.q === "string" ? f.q : "",
      cursor: f.cursor ?? null,
      limite: f.limite,
    }),
    naoLidasPorAba(dono),
  ]);
  return { ...pagina, contagens };
}

/** O número do sino, sem a lista — barato, para conferir ao voltar à aba. */
export async function contarNaoLidas(): Promise<number> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return 0;
  return getPrisma().notification.count({ where: { tenantId: ctx.tenantId, userId: ctx.userId, read: false } });
}

export async function marcarLidas(ids: string[], lida = true): Promise<void> {
  const ctx = await getAuthContext();
  const validos = idsValidos(ids);
  if (!ctx.tenantId || !ctx.userId || validos.length === 0) return;
  await getPrisma().notification.updateMany({
    where: { id: { in: validos }, tenantId: ctx.tenantId, userId: ctx.userId },
    data: { read: lida },
  });
  revalidatePath("/notificacoes");
}

export async function marcarNaoLida(id: string): Promise<void> {
  await marcarLidas([id], false);
}

/** Apaga de vez: é notificação da própria pessoa, e "arquivar" precisaria de coluna nova. */
export async function removerNotificacoes(ids: string[]): Promise<void> {
  const ctx = await getAuthContext();
  const validos = idsValidos(ids);
  if (!ctx.tenantId || !ctx.userId || validos.length === 0) return;
  await getPrisma().notification.deleteMany({
    where: { id: { in: validos }, tenantId: ctx.tenantId, userId: ctx.userId },
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
