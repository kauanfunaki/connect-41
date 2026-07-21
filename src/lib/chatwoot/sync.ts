// Sincronização inicial e reconciliação periódica — SEM fila/worker (o
// projeto não tem BullMQ/Redis, ver docs/CHATWOOT_INTEGRATION_FEASIBILITY.md
// §12). Processa um número pequeno de páginas por chamada HTTP e salva um
// checkpoint (ChatwootSyncRun.nextPage) para a próxima chamada continuar —
// evita timeout de uma request única e evita reprocessar tudo do zero.
//
// Mensagens NÃO são sincronizadas aqui (só metadado de conversa) — o corpo é
// buscado sob demanda na primeira abertura da conversa (ver actions.ts da UI
// de Conversas) e mantido depois via webhook.
import { getPrisma } from "@/lib/prisma";
import { resolveConnectionCredentials } from "./connection";
import { listConversations } from "./client";
import { normalizeConversation } from "./mappers";
import { findLinkCandidates, resolveLink } from "./linking";
import { ChatwootError } from "./errors";

const MAX_PAGES_PER_CALL = 5;

// Upsert de uma conversa normalizada + vínculo de contato — reaproveitado
// tanto pela sincronização em lote quanto pelo processador de webhook
// (src/lib/chatwoot/webhookProcessor.ts), pra não duplicar a lógica de upsert.
export async function upsertConversation(
  prisma: ReturnType<typeof getPrisma>,
  tenantId: string,
  connectionId: string,
  normalized: ReturnType<typeof normalizeConversation>
): Promise<{ id: string; created: boolean }> {
  let contactLinkId: string | null = null;
  if (normalized.contact) {
    const link = await upsertContactLink(prisma, tenantId, connectionId, normalized.contact);
    contactLinkId = link.id;
  }

  const existing = await prisma.chatwootConversation.findUnique({
    where: { tenantId_connectionId_chatwootConversationId: { tenantId, connectionId, chatwootConversationId: normalized.chatwootConversationId } },
    select: { id: true },
  });

  const saved = await prisma.chatwootConversation.upsert({
    where: { tenantId_connectionId_chatwootConversationId: { tenantId, connectionId, chatwootConversationId: normalized.chatwootConversationId } },
    create: {
      tenantId,
      connectionId,
      chatwootConversationId: normalized.chatwootConversationId,
      contactLinkId,
      inboxId: normalized.inboxId,
      assigneeLabel: normalized.assigneeLabel,
      teamLabel: normalized.teamLabel,
      status: normalized.status,
      priority: normalized.priority,
      labels: normalized.labels,
      channel: normalized.channel,
      lastActivityAt: normalized.lastActivityAt,
      unreadCount: normalized.unreadCount,
      lastMessagePreview: normalized.lastMessagePreview,
    },
    update: {
      contactLinkId,
      assigneeLabel: normalized.assigneeLabel,
      teamLabel: normalized.teamLabel,
      status: normalized.status,
      priority: normalized.priority,
      labels: normalized.labels,
      lastActivityAt: normalized.lastActivityAt,
      unreadCount: normalized.unreadCount,
      lastMessagePreview: normalized.lastMessagePreview,
      syncedAt: new Date(),
    },
  });

  return { id: saved.id, created: !existing };
}

export type SyncOutcome = {
  status: "COMPLETED" | "PARTIAL" | "NOT_CONFIGURED" | "FAILED";
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  error?: string;
};

export async function upsertContactLink(
  prisma: ReturnType<typeof getPrisma>,
  tenantId: string,
  connectionId: string,
  contact: { chatwootContactId: number; name: string | null; email: string | null; phone: string | null }
) {
  const existing = await prisma.chatwootContactLink.findUnique({
    where: { tenantId_connectionId_chatwootContactId: { tenantId, connectionId, chatwootContactId: contact.chatwootContactId } },
  });

  // Vínculo manual já confirmado nunca é sobrescrito automaticamente.
  if (existing && existing.linkMethod === "MANUAL") {
    return existing;
  }

  const candidates = await findLinkCandidates(prisma, tenantId, contact);
  const resolved = resolveLink(candidates);

  return prisma.chatwootContactLink.upsert({
    where: { tenantId_connectionId_chatwootContactId: { tenantId, connectionId, chatwootContactId: contact.chatwootContactId } },
    create: {
      tenantId,
      connectionId,
      chatwootContactId: contact.chatwootContactId,
      chatwootEmail: contact.email,
      chatwootPhoneE164: contact.phone,
      linkMethod: resolved.linkMethod,
      linkConfidence: resolved.linkConfidence,
      personId: resolved.personId,
      companyId: resolved.companyId,
      lastSyncAt: new Date(),
    },
    update: {
      chatwootEmail: contact.email,
      chatwootPhoneE164: contact.phone,
      linkMethod: resolved.linkMethod,
      linkConfidence: resolved.linkConfidence,
      personId: resolved.personId,
      companyId: resolved.companyId,
      lastSyncAt: new Date(),
    },
  });
}

export async function runChatwootSync(tenantId: string, type: "INITIAL" | "RECONCILIATION"): Promise<SyncOutcome> {
  const prisma = getPrisma();
  const resolved = await resolveConnectionCredentials(tenantId);
  if (!resolved) return { status: "NOT_CONFIGURED", recordsRead: 0, recordsCreated: 0, recordsUpdated: 0 };
  const { connectionId, creds } = resolved;

  // INITIAL retoma a run RUNNING existente (checkpoint); RECONCILIATION
  // sempre começa do zero (poucas páginas, revisita conversas recentes).
  let run =
    type === "INITIAL"
      ? await prisma.chatwootSyncRun.findFirst({ where: { connectionId, type: "INITIAL", status: "RUNNING" }, orderBy: { startedAt: "desc" } })
      : null;

  if (!run) {
    run = await prisma.chatwootSyncRun.create({ data: { tenantId, connectionId, type, status: "RUNNING", nextPage: 1 } });
  }

  let recordsRead = run.recordsRead;
  let recordsCreated = run.recordsCreated;
  let recordsUpdated = run.recordsUpdated;
  let page = run.nextPage;
  let pagesProcessed = 0;
  let reachedEnd = false;

  try {
    while (pagesProcessed < MAX_PAGES_PER_CALL) {
      const result = await listConversations(creds, page, "all");
      const conversations = result.data.payload;
      if (conversations.length === 0) {
        reachedEnd = true;
        break;
      }

      for (const raw of conversations) {
        const normalized = normalizeConversation(raw);
        const { created } = await upsertConversation(prisma, tenantId, connectionId, normalized);

        recordsRead++;
        if (created) recordsCreated++;
        else recordsUpdated++;
      }

      page++;
      pagesProcessed++;

      // Reconciliação só revisita as páginas mais recentes (conversas
      // ordenadas por atividade) — não precisa varrer a conta inteira.
      if (type === "RECONCILIATION" && pagesProcessed >= MAX_PAGES_PER_CALL) break;
    }

    const done = reachedEnd || type === "RECONCILIATION";
    await prisma.chatwootSyncRun.update({
      where: { id: run.id },
      data: {
        status: done ? "COMPLETED" : "RUNNING",
        nextPage: done ? 1 : page,
        recordsRead,
        recordsCreated,
        recordsUpdated,
        finishedAt: done ? new Date() : null,
      },
    });

    if (done) {
      await prisma.chatwootConnection.update({ where: { id: connectionId }, data: { lastSyncAt: new Date() } });
    }

    return { status: done ? "COMPLETED" : "PARTIAL", recordsRead, recordsCreated, recordsUpdated };
  } catch (err) {
    const message = err instanceof ChatwootError ? err.message : err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[chatwoot:sync]", tenantId, message);
    await prisma.chatwootSyncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", recordsRead, recordsCreated, recordsUpdated, error: message, finishedAt: new Date() },
    });
    return { status: "FAILED", recordsRead, recordsCreated, recordsUpdated, error: message };
  }
}

// Roda a sincronização (inicial se nunca rodou / retomando checkpoint;
// reconciliação se já tem pelo menos uma run concluída) para todos os tenants
// com conexão ativa — chamado pelo endpoint de cron (n8n), mesmo padrão de
// runAlertEngine() em src/lib/alerts.ts.
export async function runChatwootSyncForAllTenants(): Promise<{ tenants: number; results: Record<string, SyncOutcome> }> {
  const prisma = getPrisma();
  const connections = await prisma.chatwootConnection.findMany({ where: { active: true }, select: { tenantId: true } });
  const results: Record<string, SyncOutcome> = {};

  for (const { tenantId } of connections) {
    const hasCompletedInitial = await prisma.chatwootSyncRun.findFirst({
      where: { tenantId, type: "INITIAL", status: "COMPLETED" },
      select: { id: true },
    });
    results[tenantId] = await runChatwootSync(tenantId, hasCompletedInitial ? "RECONCILIATION" : "INITIAL");
  }

  return { tenants: connections.length, results };
}
