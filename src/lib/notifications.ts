import { getPrisma } from "@/lib/prisma";
import type { EntityType } from "@/generated/prisma/enums";
import { sendWebPushToUser } from "@/lib/webPush";

type NotifyInput = {
  tenantId: string;
  type: string;
  message: string;
  entityType?: EntityType;
  entityId?: string;
};

// Mesmo mapeamento usado pelo sino/página de notificações (layout.tsx,
// notificacoes/page.tsx) — mantido em sincronia manualmente, não vale extrair
// uma abstração maior só por causa de 2 linhas repetidas.
function buildNotificationUrl(entityType?: EntityType, entityId?: string): string {
  if (!entityType || !entityId) return "/notificacoes";
  return entityType === "COMPANY" ? `/empresas/${entityId}` : `/pessoas/${entityId}`;
}

export async function notifyUser(userId: string, input: NotifyInput): Promise<void> {
  const prisma = getPrisma();
  await prisma.notification.create({
    data: {
      tenantId: input.tenantId,
      userId,
      type: input.type,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
    },
  });

  await sendWebPushToUser(input.tenantId, userId, {
    title: "Connect",
    body: input.message,
    url: buildNotificationUrl(input.entityType, input.entityId),
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
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
    })),
  });

  const url = buildNotificationUrl(input.entityType, input.entityId);
  await Promise.all(
    users.map((u) => sendWebPushToUser(input.tenantId, u.id, { title: "Connect", body: input.message, url }))
  );
}
