"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
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
  const primeiroCadastro = !existing?.integration;
  if (!apiToken && primeiroCadastro) return { error: "Token de API é obrigatório no primeiro cadastro." };
  if (!webhookSecret && primeiroCadastro) return { error: "Segredo de webhook é obrigatório no primeiro cadastro." };

  // A credencial vai **só** para a integração (desde 16/09 a conexão não guarda
  // segredo). Campo em branco mantém o que estava — é o `mesclarConfig`. No
  // primeiro cadastro a integração nasce ligada, porque cadastrar aqui é o ato
  // de ligar o Chatwoot; depois disso, ligar e desligar é da vitrine.
  const integracao = await salvarIntegracao({
    tenantId: ctx.tenantId,
    code: "chatwoot",
    instanceKey: existing?.integration?.instanceKey ?? accountId,
    label: existing?.integration?.label ?? `Conta ${accountId}`,
    ...(primeiroCadastro ? { enabled: true } : {}),
    campos: { baseUrl, accountId, apiToken, webhookSecret },
  });
  if (!integracao.ok) return { error: integracao.erro };

  try {
    if (existing) {
      await prisma.chatwootConnection.update({
        where: { id: existing.id },
        data: { baseUrl, accountId, active: true, integrationId: integracao.id },
      });
    } else {
      await prisma.chatwootConnection.create({
        data: { tenantId: ctx.tenantId, baseUrl, accountId, active: true, integrationId: integracao.id },
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
    const salvas = credenciaisDaConexao(existing);
    if (!salvas) {
      return { ok: false, error: "Não há token salvo que valha: a integração do Chatwoot está desligada ou incompleta." };
    }
    apiToken = salvas.apiToken;
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
