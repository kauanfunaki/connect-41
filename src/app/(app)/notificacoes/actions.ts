"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { ehAba, ocultosValidos, type AbaOuTodas } from "@/lib/notificacoes/catalogo";
import {
  consultarNotificacoes,
  contarNaoLidasVisiveis,
  naoLidasPorAba,
  ondeDasNotificacoes,
  tiposOcultos,
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

  // Só o que a pessoa vê na aba: tipo oculto e arquivada ficam como estão.
  const dono = { tenantId: ctx.tenantId, userId: ctx.userId };
  const prisma = getPrisma();
  await prisma.notification.updateMany({
    where: ondeDasNotificacoes(dono, { aba: ehAba(aba) ? aba : "todas", status: "nao_lidas", q: "" }, await tiposOcultos(dono)),
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

export async function listarNotificacoes(f: Partial<FiltrosDasNotificacoes>): Promise<{
  itens: NotificacaoNaTela[];
  proximoCursor: string | null;
  contagens: Record<AbaOuTodas, number>;
  /** Quantos tipos a pessoa desligou — o sino avisa, para nada sumir sem ela saber. */
  ocultos: number;
}> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { itens: [], proximoCursor: null, contagens: { todas: 0, para_mim: 0, clientes: 0, alertas: 0 }, ocultos: 0 };
  const dono = { tenantId: ctx.tenantId, userId: ctx.userId };
  const ocultos = await tiposOcultos(dono);
  const [pagina, contagens] = await Promise.all([
    consultarNotificacoes(
      dono,
      {
        aba: ehAba(f.aba) ? f.aba : "todas",
        status: f.status === "nao_lidas" ? "nao_lidas" : "todas",
        q: typeof f.q === "string" ? f.q : "",
        arquivadas: f.arquivadas === true,
        cursor: f.cursor ?? null,
        limite: f.limite,
      },
      ocultos
    ),
    naoLidasPorAba(dono, ocultos),
  ]);
  return { ...pagina, contagens, ocultos: ocultos.length };
}

/** O número do sino, sem a lista — barato, para conferir ao voltar à aba. */
export async function contarNaoLidas(): Promise<number> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return 0;
  const dono = { tenantId: ctx.tenantId, userId: ctx.userId };
  return contarNaoLidasVisiveis(dono, await tiposOcultos(dono));
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

/** Apaga de vez: é notificação da própria pessoa. Para tirar da frente sem perder, há o arquivar. */
export async function removerNotificacoes(ids: string[]): Promise<void> {
  const ctx = await getAuthContext();
  const validos = idsValidos(ids);
  if (!ctx.tenantId || !ctx.userId || validos.length === 0) return;
  await getPrisma().notification.deleteMany({
    where: { id: { in: validos }, tenantId: ctx.tenantId, userId: ctx.userId },
  });
  revalidatePath("/notificacoes");
}

// ─── Arquivar e preferências (05/10/2026) ──────────────────────────────────

/** Arquiva (ou desarquiva): sai do sino e das abas, e fica na caixa das arquivadas. */
export async function arquivarNotificacoes(ids: string[], arquivar = true): Promise<void> {
  const ctx = await getAuthContext();
  const validos = idsValidos(ids);
  if (!ctx.tenantId || !ctx.userId || validos.length === 0) return;
  await getPrisma().notification.updateMany({
    where: { id: { in: validos }, tenantId: ctx.tenantId, userId: ctx.userId },
    data: { archivedAt: arquivar ? new Date() : null },
  });
  revalidatePath("/notificacoes");
}

/** "Arquivar as lidas" da aba: só o que a pessoa vê nela — as não lidas ficam. */
export async function arquivarLidas(aba?: AbaOuTodas): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;
  const dono = { tenantId: ctx.tenantId, userId: ctx.userId };
  const onde = ondeDasNotificacoes(dono, { aba: ehAba(aba) ? aba : "todas", status: "todas", q: "" }, await tiposOcultos(dono));
  await getPrisma().notification.updateMany({ where: { ...onde, read: true }, data: { archivedAt: new Date() } });
  revalidatePath("/notificacoes");
}

/**
 * Grava os tipos que a pessoa desligou, trocando a lista inteira. Tipo fora do
 * catálogo é ignorado: o que não se pode escolher na tela não se esconde.
 */
export async function salvarTiposOcultos(tipos: string[]): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado." };
  const validos = ocultosValidos(tipos);
  const dono = { tenantId: ctx.tenantId, userId: ctx.userId };
  try {
    await getPrisma().$transaction([
      getPrisma().notificationHiddenType.deleteMany({ where: dono }),
      ...(validos.length > 0 ? [getPrisma().notificationHiddenType.createMany({ data: validos.map((type) => ({ ...dono, type })) })] : []),
    ]);
  } catch (err) {
    console.error("[salvarTiposOcultos]", err);
    return { error: "Não deu para salvar as preferências. Tente de novo." };
  }
  revalidatePath("/notificacoes");
  return null;
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
