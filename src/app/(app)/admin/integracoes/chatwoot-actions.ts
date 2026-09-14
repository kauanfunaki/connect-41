"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { encryptSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { testConnection } from "@/lib/chatwoot/client";
import { credenciaisDaConexao, SELECT_CONEXAO } from "@/lib/chatwoot/connection";
import { runChatwootSync } from "@/lib/chatwoot/sync";
import { salvarIntegracao } from "@/lib/integracoes/data";

export type ChatwootConfigState = { error: string } | { success: true } | null;

// v1: um tenant configura UMA conta Chatwoot pela UI (schema já permite mais
// de uma — ver ChatwootConnection.@@unique([tenantId, accountId]) — mas a
// tela só expõe a primeira ativa, decisão do usuário para simplificar por ora).
async function getSingleConnection(tenantId: string) {
  const prisma = getPrisma();
  return prisma.chatwootConnection.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: SELECT_CONEXAO,
  });
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

  // Espelho na integração convergida. Desde 14/09 os leitores preferem a
  // integração quando ela está ligada — sem este espelho, editar por este
  // formulário gravaria nas colunas antigas e seria ignorado em silêncio, e a
  // pessoa veria o Chatwoot seguir usando o token velho.
  //
  // Campo em branco mantém o que estava (é o `mesclarConfig`), `enabled` fica
  // como está (ligar é ato da vitrine) e o rótulo é repassado porque
  // `salvarIntegracao` grava o que receber.
  if (existing?.integration) {
    const espelho = await salvarIntegracao({
      tenantId: ctx.tenantId,
      code: "chatwoot",
      instanceKey: existing.integration.instanceKey,
      label: existing.integration.label,
      campos: { baseUrl, accountId, apiToken, webhookSecret },
    });
    if (!espelho.ok) console.error("[salvarConexaoChatwoot] espelho na integração", espelho.erro);
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
// campo do form estiver vazio (permite testar sem redigitar o token) — a mesma
// que a sincronização usaria, integração ou colunas antigas.
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
    apiToken = credenciaisDaConexao(existing).apiToken;
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
