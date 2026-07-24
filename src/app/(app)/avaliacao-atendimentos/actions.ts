"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";

// Vínculo manual agente do Chatwoot <-> User — mesmo critério de permissão
// usado pra vincular contato em /conversas (isFullAccess).
export async function vincularAgenteChatwoot(agentLinkId: string, userId: string | null): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullAccess(ctx.role)) return;

  const prisma = getPrisma();
  const agentLink = await prisma.chatwootAgentLink.findFirst({ where: { id: agentLinkId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!agentLink) return;

  if (userId) {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!user) return;
  }

  await prisma.chatwootAgentLink.update({ where: { id: agentLinkId }, data: { linkedUserId: userId } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "chatwoot.agent.linked",
    entityType: "ChatwootAgentLink",
    entityId: agentLinkId,
    metadata: { userId },
  });

  revalidatePath("/avaliacao-atendimentos");
}
