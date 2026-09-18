// Envio de push via Web Push API (VAPID) — chamado pelo motor de notificações
// (src/lib/notifications.ts) depois de gravar a Notification no banco. Nunca
// derruba o fluxo principal: falha de push é best-effort, só limpa a
// assinatura do banco quando o navegador confirma que ela expirou.
import webpush from "web-push";
import { getPrisma } from "@/lib/prisma";
import { getVapidPublicKey } from "@/lib/vapid";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  // Mesma chave que o cliente recebe — ver src/lib/vapid.ts para o porquê de
  // VAPID_PUBLIC_KEY (runtime) ter virado a variável preferida.
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type WebPushPayload = { title: string; body: string; url: string };

type Assinatura = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * O envio propriamente dito, igual para os dois públicos. `descartar` existe
 * porque a assinatura da equipe e a do cliente moram em tabelas diferentes —
 * só quem chamou sabe de qual apagar quando o navegador diz que expirou.
 */
async function enviar(
  assinaturas: Assinatura[],
  payload: WebPushPayload,
  descartar: (id: string) => Promise<unknown>,
  origem: string
): Promise<void> {
  const body = JSON.stringify(payload);
  await Promise.all(
    assinaturas.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Assinatura expirada/revogada pelo navegador — não adianta reenviar.
          await descartar(sub.id).catch(() => {});
        } else {
          console.error(`[${origem}]`, err);
        }
      }
    })
  );
}

export async function sendWebPushToUser(tenantId: string, userId: string, payload: WebPushPayload): Promise<void> {
  if (!ensureConfigured()) return; // VAPID não configurado neste ambiente — no-op silencioso

  const prisma = getPrisma();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { tenantId, userId } });
  if (subscriptions.length === 0) return;

  await enviar(
    subscriptions,
    payload,
    (id) => prisma.pushSubscription.delete({ where: { id } }),
    "sendWebPushToUser"
  );
}

/**
 * Push para clientes do portal. Recebe uma lista porque os avisos do portal são
 * sempre para o grupo que enxerga a empresa, não para uma pessoa — uma consulta
 * em vez de uma por destinatário.
 *
 * Como todo aviso do portal, é best-effort: o que foi avisado já está gravado, e
 * o cliente vê ao entrar. **O texto não leva conteúdo** — push aparece na tela
 * de bloqueio, e a regra dos e-mails ("valor, fornecedor e empresa ficam no
 * portal") vale mais ainda aqui.
 */
export async function sendWebPushToPortalUsers(
  tenantId: string,
  portalUserIds: string[],
  payload: WebPushPayload
): Promise<void> {
  if (portalUserIds.length === 0) return;
  if (!ensureConfigured()) return;

  const prisma = getPrisma();
  const subscriptions = await prisma.portalPushSubscription.findMany({
    where: { tenantId, portalUserId: { in: [...new Set(portalUserIds)] } },
  });
  if (subscriptions.length === 0) return;

  await enviar(
    subscriptions,
    payload,
    (id) => prisma.portalPushSubscription.delete({ where: { id } }),
    "sendWebPushToPortalUsers"
  );
}
