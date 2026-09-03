"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { normalizarNomeAtendente } from "@/lib/chatwoot/evaluation";

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

  revalidatePath("/admin/atendentes");
  revalidatePath("/conversas");
}

/**
 * Define o papel de um NOME de remetente: recepção, automação, ou nenhum.
 *
 * Recebe o nome e não o id de um agente, e é essa a correção de 2026-09-03:
 * `ChatwootAgentLink` só tem linha para quem já foi responsável por alguma
 * conversa, e a conta da automação escrevia 494 mensagens sem nunca ser
 * responsável por nenhuma — ficava fora da tela que deveria marcá-la.
 *
 * O nome é gravado normalizado, que é a forma comparada em tempo de execução.
 *
 * Vale para as próximas avaliações. As já gravadas só mudam quando
 * `scripts/repontuar-avaliacoes.ts` roda — mudar a marcação não repontua o
 * histórico sozinho, e não deveria: repontuar custa uma chamada de IA por
 * segmento.
 */
export async function definirPapelDoRemetente(
  senderName: string,
  papel: { isReception?: boolean; isAutomation?: boolean }
): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullAccess(ctx.role)) return;

  const nome = normalizarNomeAtendente(senderName);
  if (!nome) return;

  const prisma = getPrisma();
  await prisma.chatwootSenderRole.upsert({
    where: { tenantId_senderName: { tenantId: ctx.tenantId, senderName: nome } },
    create: {
      tenantId: ctx.tenantId,
      senderName: nome,
      isReception: papel.isReception ?? false,
      isAutomation: papel.isAutomation ?? false,
    },
    update: papel,
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "chatwoot.sender.role",
    entityType: "ChatwootSenderRole",
    entityId: nome,
    metadata: papel,
  });

  revalidatePath("/admin/atendentes");
  revalidatePath("/conversas");
}
