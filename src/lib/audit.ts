import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type AuditInput = {
  tenantId: string;
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
};

// Best-effort: uma falha ao gravar o log nunca deve derrubar a ação real do
// usuário (criar/editar/excluir), só fica registrada no console do servidor.
//
// O nome de quem agiu vai junto (`actorName`, 13/10/2026): o usuário pode ser
// excluído de verdade, e a linha da trilha fica sem o vínculo. Uma consulta a
// mais por ação registrada — a tabela de usuários é pequena e a busca é pela
// chave.
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const prisma = getPrisma();
    const ator = input.userId
      ? await prisma.user.findUnique({ where: { id: input.userId }, select: { name: true } })
      : null;
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId || null,
        actorName: ator?.name ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      },
    });
  } catch (err) {
    console.error("[logAudit]", err);
  }
}
