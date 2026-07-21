"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { testConnection } from "@/lib/chatwoot/client";
import { runChatwootSync } from "@/lib/chatwoot/sync";

export type ChatwootConfigState = { error: string } | { success: true } | null;

// v1: um tenant configura UMA conta Chatwoot pela UI (schema já permite mais
// de uma — ver ChatwootConnection.@@unique([tenantId, accountId]) — mas a
// tela só expõe a primeira ativa, decisão do usuário para simplificar por ora).
async function getSingleConnection(tenantId: string) {
  const prisma = getPrisma();
  return prisma.chatwootConnection.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" } });
}

export async function salvarConexaoChatwoot(_prev: ChatwootConfigState, form: FormData): Promise<ChatwootConfigState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para configurar integrações do Chatwoot." };

  const baseUrl = (form.get("baseUrl") as string)?.trim().replace(/\/$/, "") ?? "";
  const accountId = (form.get("accountId") as string)?.trim() ?? "";
  const apiToken = (form.get("apiToken") as string)?.trim() ?? "";
  const webhookSecret = (form.get("webhookSecret") as string)?.trim() ?? "";

  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) return { error: "URL base inválida (deve começar com http:// ou https://)." };
  if (!accountId) return { error: "ID da conta é obrigatório." };

  const prisma = getPrisma();
  const existing = await getSingleConnection(ctx.tenantId);
  if (!apiToken && !existing) return { error: "Token de API é obrigatório no primeiro cadastro." };
  if (!webhookSecret && !existing) return { error: "Segredo de webhook é obrigatório no primeiro cadastro." };

  const apiTokenEnc = apiToken ? encryptSecret(apiToken) : existing!.apiTokenEnc;
  const webhookSecretEnc = webhookSecret ? encryptSecret(webhookSecret) : existing!.webhookSecretEnc;

  try {
    if (existing) {
      await prisma.chatwootConnection.update({
        where: { id: existing.id },
        data: { baseUrl, accountId, apiTokenEnc, webhookSecretEnc, active: true },
      });
    } else {
      await prisma.chatwootConnection.create({
        data: { tenantId: ctx.tenantId, baseUrl, accountId, apiTokenEnc, webhookSecretEnc, active: true },
      });
    }
  } catch (err) {
    console.error("[salvarConexaoChatwoot]", err);
    return { error: "Erro ao salvar conexão com o Chatwoot." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "tenant.chatwoot.update", entityType: "Tenant", entityId: ctx.tenantId });

  revalidatePath("/admin/integracoes");
  return { success: true };
}

export async function removerConexaoChatwoot(): Promise<ChatwootConfigState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para configurar integrações do Chatwoot." };

  const prisma = getPrisma();
  await prisma.chatwootConnection.deleteMany({ where: { tenantId: ctx.tenantId } });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "tenant.chatwoot.remove", entityType: "Tenant", entityId: ctx.tenantId });

  revalidatePath("/admin/integracoes");
  return { success: true };
}

// Smoke test de conectividade (Etapa 2 do pedido original): 1 chamada de
// leitura, sem paginar tudo, nunca imprime o token. Usa a chave já salva se o
// campo do form estiver vazio (permite testar sem redigitar o token).
export async function testarConexaoChatwoot(input: {
  baseUrl: string;
  accountId: string;
  apiToken: string;
}): Promise<{ ok: true; conversationCount: number } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { ok: false, error: "Sem permissão." };

  let apiToken = input.apiToken;
  if (!apiToken) {
    const existing = await getSingleConnection(ctx.tenantId);
    if (!existing) return { ok: false, error: "Informe o token para testar (nenhuma conexão salva ainda)." };
    apiToken = decryptSecret(existing.apiTokenEnc);
  }
  if (!input.baseUrl || !input.accountId) return { ok: false, error: "Preencha URL base e ID da conta." };

  try {
    return await testConnection({ baseUrl: input.baseUrl.replace(/\/$/, ""), accountId: input.accountId, apiToken });
  } catch (err) {
    console.error("[testarConexaoChatwoot]", err);
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao conectar ao Chatwoot." };
  }
}

// Dispara a sincronização manualmente (além da rota de cron externa) — útil
// logo após cadastrar a conexão, sem esperar o próximo disparo do n8n.
export async function sincronizarChatwootAgora(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { ok: false, error: "Sem permissão." };

  const prisma = getPrisma();
  const hasCompletedInitial = await prisma.chatwootSyncRun.findFirst({
    where: { tenantId: ctx.tenantId, type: "INITIAL", status: "COMPLETED" },
    select: { id: true },
  });

  const result = await runChatwootSync(ctx.tenantId, hasCompletedInitial ? "RECONCILIATION" : "INITIAL");
  if (result.status === "NOT_CONFIGURED") return { ok: false, error: "Nenhuma conexão ativa com o Chatwoot." };
  if (result.status === "FAILED") return { ok: false, error: result.error ?? "Falha na sincronização." };

  revalidatePath("/admin/integracoes");
  return {
    ok: true,
    message: `Sincronização ${result.status === "COMPLETED" ? "concluída" : "em andamento (continuará na próxima chamada)"}: ${result.recordsRead} conversas lidas, ${result.recordsCreated} novas, ${result.recordsUpdated} atualizadas.`,
  };
}
