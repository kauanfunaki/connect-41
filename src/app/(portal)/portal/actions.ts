"use server";

// As assinaturas de push do cliente no portal.
//
// Espelham `(app)/notificacoes/actions.ts`, mas contra `portal_push_subscriptions`
// e com a sessão do portal: quem grava é o `PortalUser` conferido ativo no
// banco, não o token sozinho — conta desativada de manhã ainda tem token válido
// à tarde, e uma assinatura gravada por ela continuaria recebendo aviso do
// cliente depois de o acesso ter sido tirado.

import { getPrisma } from "@/lib/prisma";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";

export async function salvarPushDoPortal(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ error: string } | null> {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return { error: "Sessão expirada. Entre de novo no portal." };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Assinatura inválida." };

  const prisma = getPrisma();
  // `endpoint` é único no banco inteiro: o mesmo navegador que trocou de conta
  // reaproveita o endpoint, e o upsert transfere a assinatura para quem está
  // logado agora em vez de deixar a anterior recebendo os avisos.
  await prisma.portalPushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      tenantId: cliente.tenantId,
      portalUserId: cliente.usuario.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    update: {
      tenantId: cliente.tenantId,
      portalUserId: cliente.usuario.id,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  });
  return null;
}

export async function removerPushDoPortal(endpoint: string): Promise<void> {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente || !endpoint) return;
  const prisma = getPrisma();
  await prisma.portalPushSubscription.deleteMany({
    where: { endpoint, tenantId: cliente.tenantId, portalUserId: cliente.usuario.id },
  });
}
