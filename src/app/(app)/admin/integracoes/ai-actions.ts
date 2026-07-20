"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import type { AiProvider } from "@/generated/prisma/enums";

export type AiConfigState = { error: string } | { success: true } | null;

const PROVIDERS: AiProvider[] = ["ANTHROPIC", "OPENAI"];

// Chave em branco no "Salvar" mantém a chave já cadastrada — mesmo padrão do
// SmtpConfigForm (nunca reexibe o segredo, só permite trocar).
export async function salvarConfigIA(_prev: AiConfigState, form: FormData): Promise<AiConfigState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para configurar integrações de IA." };

  const provider = form.get("provider") as AiProvider;
  const apiKey = (form.get("apiKey") as string)?.trim() ?? "";
  const model = (form.get("model") as string)?.trim() || null;

  if (!PROVIDERS.includes(provider)) return { error: "Provedor inválido." };

  const prisma = getPrisma();
  const existing = await prisma.tenantAiConfig.findUnique({ where: { tenantId: ctx.tenantId } });
  if (!apiKey && !existing) return { error: "Chave de API é obrigatória no primeiro cadastro." };

  const apiKeyEnc = apiKey ? encryptSecret(apiKey) : existing!.apiKeyEnc;

  try {
    await prisma.tenantAiConfig.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, provider, apiKeyEnc, model },
      update: { provider, apiKeyEnc, model },
    });
  } catch (err) {
    console.error("[salvarConfigIA]", err);
    return { error: "Erro ao salvar configuração de IA." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "tenant.ai.update",
    entityType: "Tenant",
    entityId: ctx.tenantId,
    metadata: { provider, model },
  });

  revalidatePath("/admin/integracoes");
  return { success: true };
}

export async function removerConfigIA(): Promise<AiConfigState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para configurar integrações de IA." };

  const prisma = getPrisma();
  await prisma.tenantAiConfig.deleteMany({ where: { tenantId: ctx.tenantId } });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "tenant.ai.remove", entityType: "Tenant", entityId: ctx.tenantId });

  revalidatePath("/admin/integracoes");
  return { success: true };
}

// Validação leve: lista modelos do provedor (não gera conteúdo, não tem custo
// relevante) só pra confirmar que a chave é aceita — mesmo espírito do
// "Testar conexão" do SmtpConfigForm.
export async function testarChaveIA(input: { provider: AiProvider; apiKey: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { ok: false, error: "Sem permissão." };

  let apiKey = input.apiKey;
  if (!apiKey) {
    const prisma = getPrisma();
    const existing = await prisma.tenantAiConfig.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!existing) return { ok: false, error: "Informe a chave para testar (nenhuma chave salva ainda)." };
    apiKey = decryptSecret(existing.apiKeyEnc);
  }

  try {
    if (input.provider === "ANTHROPIC") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      if (!res.ok) return { ok: false, error: res.status === 401 ? "Chave inválida." : `Erro ao validar chave (${res.status}).` };
    } else {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return { ok: false, error: res.status === 401 ? "Chave inválida." : `Erro ao validar chave (${res.status}).` };
    }
  } catch (err) {
    console.error("[testarChaveIA]", err);
    return { ok: false, error: "Não foi possível conectar ao provedor. Tente novamente." };
  }

  return { ok: true };
}
