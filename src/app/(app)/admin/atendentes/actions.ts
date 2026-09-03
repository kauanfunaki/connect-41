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

  revalidatePath("/admin/atendentes");
  revalidatePath("/conversas");
}

/**
 * Marca (ou desmarca) um agente do Chatwoot como recepção/triagem.
 *
 * É o que define a barreira entre triagem e tratativa: a primeira resposta ao
 * cliente de alguém NÃO marcado aqui abre a tratativa. Ver
 * `segmentarAtendimento` em src/lib/chatwoot/segments.ts.
 *
 * Vale para as próximas avaliações. As já gravadas só mudam quando
 * `scripts/repontuar-avaliacoes.ts` roda — mudar a marcação não repontua o
 * histórico sozinho, e não deveria: repontuar custa uma chamada de IA por
 * segmento.
 */
export async function definirRecepcaoAgente(agentLinkId: string, isReception: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullAccess(ctx.role)) return;

  const prisma = getPrisma();
  const agentLink = await prisma.chatwootAgentLink.findFirst({
    where: { id: agentLinkId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!agentLink) return;

  await prisma.chatwootAgentLink.update({ where: { id: agentLinkId }, data: { isReception } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "chatwoot.agent.reception",
    entityType: "ChatwootAgentLink",
    entityId: agentLinkId,
    metadata: { isReception },
  });

  revalidatePath("/admin/atendentes");
  revalidatePath("/conversas");
}

/**
 * Marca (ou desmarca) um agente do Chatwoot como conta de automação.
 *
 * A conta dona do token da integração recebe a autoria de tudo que o sistema
 * manda — saudação, fora de horário, pedido de avaliação, agradecimento final —
 * e por isso era creditada como quem atendeu, já que a mensagem de encerramento
 * é sempre a última. Marcada aqui, essas mensagens deixam de contar como
 * atendimento, e as que trazem o autor carimbado no texto (gateway de WhatsApp)
 * voltam para quem de fato escreveu. Ver `autorEfetivo` em
 * src/lib/chatwoot/segments.ts.
 */
export async function definirAutomacaoAgente(agentLinkId: string, isAutomation: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullAccess(ctx.role)) return;

  const prisma = getPrisma();
  const agentLink = await prisma.chatwootAgentLink.findFirst({
    where: { id: agentLinkId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!agentLink) return;

  await prisma.chatwootAgentLink.update({ where: { id: agentLinkId }, data: { isAutomation } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "chatwoot.agent.automation",
    entityType: "ChatwootAgentLink",
    entityId: agentLinkId,
    metadata: { isAutomation },
  });

  revalidatePath("/admin/atendentes");
  revalidatePath("/conversas");
}
