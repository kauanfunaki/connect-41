"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { ensureMessagesLoaded, loadOlderMessages } from "@/lib/chatwoot/conversations";
import { formatInstantDate } from "@/lib/format";

export type MensagemAtendimento = {
  id: string;
  senderLabel: string | null;
  messageType: string;
  content: string | null;
  isPrivate: boolean;
  attachments: { fileType: string; fileSize: number | null; url: string }[];
  createdAtLabel: string;
};

// Carrega (sob demanda, na primeira expansão do atendimento) e retorna as
// mensagens já serializadas. Notas internas são filtradas AQUI, no servidor —
// nunca chegam ao browser de quem não tem permissão.
export async function carregarMensagens(conversationId: string): Promise<MensagemAtendimento[]> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return [];

  const prisma = getPrisma();
  const conversation = await prisma.chatwootConversation.findFirst({
    where: { id: conversationId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!conversation) return [];

  await ensureMessagesLoaded(ctx.tenantId, conversationId);

  const canViewPrivate = isFullAccess(ctx.role);
  const messages = await prisma.chatwootMessage.findMany({
    where: { conversationId, ...(canViewPrivate ? {} : { isPrivate: false }) },
    orderBy: { chatwootCreatedAt: "asc" },
  });

  return messages.map((m) => ({
    id: m.id,
    senderLabel: m.senderLabel,
    messageType: m.messageType,
    content: m.content,
    isPrivate: m.isPrivate,
    attachments: (m.attachments as { fileType: string; fileSize: number | null; url: string }[] | null) ?? [],
    createdAtLabel: formatInstantDate(m.chatwootCreatedAt),
  }));
}

// Busca uma página mais antiga na API do Chatwoot e devolve a lista completa
// atualizada (mesma serialização/filtro de carregarMensagens).
export async function carregarMensagensAntigas(conversationId: string): Promise<{ loaded: number; messages: MensagemAtendimento[] }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { loaded: 0, messages: [] };
  const { loaded } = await loadOlderMessages(ctx.tenantId, conversationId);
  return { loaded, messages: await carregarMensagens(conversationId) };
}

// Vínculo manual — nunca sobrescrito por sincronização automática (ver
// upsertContactLink em src/lib/chatwoot/sync.ts). Só quem administra o tenant
// resolve ambiguidades (contato ASSISTED/UNLINKED), mesmo critério de
// isFullAccess usado para dado sensível em outros módulos.
export async function vincularContatoChatwoot(
  contactLinkId: string,
  target: { personId?: string; companyId?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, error: "Não autenticado" };
  if (!isFullAccess(ctx.role)) return { ok: false, error: "Sem permissão para vincular contatos." };

  const prisma = getPrisma();
  const link = await prisma.chatwootContactLink.findFirst({ where: { id: contactLinkId, tenantId: ctx.tenantId } });
  if (!link) return { ok: false, error: "Vínculo não encontrado." };

  await prisma.chatwootContactLink.update({
    where: { id: contactLinkId },
    data: { personId: target.personId ?? null, companyId: target.companyId ?? null, linkMethod: "MANUAL", linkConfidence: null },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "chatwoot.contact.linked",
    entityType: "ChatwootContactLink",
    entityId: contactLinkId,
    metadata: { personId: target.personId, companyId: target.companyId },
  });

  revalidatePath("/conversas");
  return { ok: true };
}

export async function desvincularContatoChatwoot(contactLinkId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, error: "Não autenticado" };
  if (!isFullAccess(ctx.role)) return { ok: false, error: "Sem permissão para desvincular contatos." };

  const prisma = getPrisma();
  const link = await prisma.chatwootContactLink.findFirst({ where: { id: contactLinkId, tenantId: ctx.tenantId } });
  if (!link) return { ok: false, error: "Vínculo não encontrado." };

  await prisma.chatwootContactLink.update({
    where: { id: contactLinkId },
    data: { personId: null, companyId: null, linkMethod: "UNLINKED", linkConfidence: null },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "chatwoot.contact.unlinked",
    entityType: "ChatwootContactLink",
    entityId: contactLinkId,
  });

  revalidatePath("/conversas");
  return { ok: true };
}
