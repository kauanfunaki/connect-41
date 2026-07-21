// Envio de push via Web Push API (VAPID) — chamado pelo motor de notificações
// (src/lib/notifications.ts) depois de gravar a Notification no banco. Nunca
// derruba o fluxo principal: falha de push é best-effort, só limpa a
// assinatura do banco quando o navegador confirma que ela expirou.
import webpush from "web-push";
import { getPrisma } from "@/lib/prisma";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type WebPushPayload = { title: string; body: string; url: string };

export async function sendWebPushToUser(tenantId: string, userId: string, payload: WebPushPayload): Promise<void> {
  if (!ensureConfigured()) return; // VAPID não configurado neste ambiente — no-op silencioso

  const prisma = getPrisma();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { tenantId, userId } });
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Assinatura expirada/revogada pelo navegador — não adianta reenviar.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[sendWebPushToUser]", err);
        }
      }
    })
  );
}
