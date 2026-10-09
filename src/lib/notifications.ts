import { getPrisma } from "@/lib/prisma";
import type { EntityType } from "@/generated/prisma/enums";
import { sendWebPushToUser } from "@/lib/webPush";
import { linkDaNotificacao } from "@/lib/notificacaoLink";

export type NotifyInput = {
  tenantId: string;
  type: string;
  message: string;
  entityType?: EntityType;
  entityId?: string;
  /**
   * Quem causou (05/10/2026): o sino mostra a foto dessa pessoa. Só quando é
   * alguém da equipe — alerta automático, cliente e candidato ficam sem.
   */
  actorUserId?: string | null;
};

/** O tamanho da coluna `notifications.message` (`VarChar(255)` no schema). */
export const LIMITE_DA_MENSAGEM = 255;

/**
 * A mensagem do jeito que cabe na coluna (08/10/2026). A Gestão e a varredura
 * do Societário cortavam em 480, e a coluna tem 255: a gravação falhava e a
 * notificação se perdia inteira. Cortar aqui vale para todo aviso; o push do
 * celular, que não tem coluna, continua com o texto todo.
 */
export function mensagemQueCabe(mensagem: string): string {
  const limpa = mensagem.trim();
  if (limpa.length <= LIMITE_DA_MENSAGEM) return limpa;
  return limpa.slice(0, LIMITE_DA_MENSAGEM - 1).trimEnd() + "…";
}

// O mesmo link do sino e da página de notificações — ver src/lib/notificacaoLink.ts.
function buildNotificationUrl(input: NotifyInput): string {
  return linkDaNotificacao(input) ?? "/notificacoes";
}

/**
 * Quem desligou este tipo nas preferências (05/10/2026): a notificação é
 * gravada mesmo assim — religar mostra o histórico —, mas o push não sai.
 * Falhar aqui não pode impedir o aviso: na dúvida, o push sai.
 */
async function quemEscondeuOTipo(tenantId: string, type: string, userIds: string[]): Promise<Set<string>> {
  try {
    const linhas = await getPrisma().notificationHiddenType.findMany({
      where: { tenantId, type, userId: { in: userIds } },
      select: { userId: true },
    });
    return new Set(linhas.map((l) => l.userId));
  } catch (err) {
    console.error("[notifications] preferências", err);
    return new Set();
  }
}

export async function notifyUser(userId: string, input: NotifyInput): Promise<void> {
  const prisma = getPrisma();
  await prisma.notification.create({
    data: {
      tenantId: input.tenantId,
      userId,
      type: input.type,
      message: mensagemQueCabe(input.message),
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: input.actorUserId || null,
    },
  });

  if ((await quemEscondeuOTipo(input.tenantId, input.type, [userId])).has(userId)) return;
  await sendWebPushToUser(input.tenantId, userId, {
    title: "Connect",
    body: input.message,
    url: buildNotificationUrl(input),
  });
}

// Notifica todos os usuários ativos vinculados a um setor (ex: ao criar um handoff
// para aquele setor). Não inclui ADMIN/SUPER_ADMIN automaticamente — eles enxergam
// tudo pelas telas normais, notificação direcionada é só para quem "dono" do setor.
export async function notifySector(sectorCode: string, input: NotifyInput): Promise<void> {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: {
      tenantId: input.tenantId,
      active: true,
      sectors: { some: { sectorCode } },
    },
    select: { id: true },
  });
  if (users.length === 0) return;

  await prisma.notification.createMany({
    data: users.map((u) => ({
      tenantId: input.tenantId,
      userId: u.id,
      type: input.type,
      message: mensagemQueCabe(input.message),
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: input.actorUserId || null,
    })),
  });

  const url = buildNotificationUrl(input);
  const semPush = await quemEscondeuOTipo(input.tenantId, input.type, users.map((u) => u.id));
  await Promise.all(
    users
      .filter((u) => !semPush.has(u.id))
      .map((u) => sendWebPushToUser(input.tenantId, u.id, { title: "Connect", body: input.message, url }))
  );
}
