import { getPrisma } from "@/lib/prisma";
import type { EntityType } from "@/generated/prisma/enums";

type NotifyInput = {
  tenantId: string;
  type: string;
  message: string;
  entityType?: EntityType;
  entityId?: string;
};

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
}
