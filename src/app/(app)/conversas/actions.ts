"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { loadOlderMessages } from "@/lib/chatwoot/conversations";

export async function carregarMensagensAntigas(conversationId: string): Promise<{ loaded: number }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { loaded: 0 };
  const result = await loadOlderMessages(ctx.tenantId, conversationId);
  revalidatePath("/conversas");
  return result;
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
