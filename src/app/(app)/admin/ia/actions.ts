"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { agenteDoCatalogo } from "@/lib/ia/catalogo";

export type AgenteState = { error: string } | { success: true } | null;

/**
 * Lê um teto do formulário.
 *
 * Vazio é "volta a valer o do catálogo" (nulo); zero é "não gaste nada", que é
 * um valor legítimo e diferente de vazio. Tratar os dois igual — que é o que
 * `Number(x) || null` faria — tiraria do administrador a única forma de parar
 * um agente sem desligá-lo.
 */
function lerTeto(bruto: FormDataEntryValue | null): { ok: true; valor: number | null } | { ok: false } {
  const texto = typeof bruto === "string" ? bruto.trim() : "";
  if (texto === "") return { ok: true, valor: null };
  const n = Number(texto);
  if (!Number.isInteger(n) || n < 0) return { ok: false };
  return { ok: true, valor: n };
}

export async function salvarAgente(_prev: AgenteState, form: FormData): Promise<AgenteState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  // Mesmo critério da chave de IA: quem mexe em teto de gasto administra o
  // tenant inteiro, não um setor.
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para configurar agentes de IA." };

  const agentCode = String(form.get("agentCode") ?? "");
  const def = agenteDoCatalogo(agentCode);
  if (!def) return { error: "Agente desconhecido." };

  const enabled = form.get("enabled") === "on";
  const model = (form.get("model") as string)?.trim() || null;

  const reais = lerTeto(form.get("monthlyCapCents"));
  if (!reais.ok) return { error: "Teto de gasto inválido — use um número inteiro de centavos, ou deixe em branco." };
  const chamadas = lerTeto(form.get("monthlyCapCalls"));
  if (!chamadas.ok) return { error: "Teto de chamadas inválido — use um número inteiro, ou deixe em branco." };

  const dados = {
    enabled,
    model,
    monthlyCapCents: reais.valor,
    monthlyCapCalls: chamadas.valor,
  };

  try {
    const prisma = getPrisma();
    await prisma.tenantAgent.upsert({
      where: { tenantId_agentCode: { tenantId: ctx.tenantId, agentCode } },
      create: { tenantId: ctx.tenantId, agentCode, ...dados },
      update: dados,
    });
  } catch (err) {
    console.error("[salvarAgente]", err);
    return { error: "Erro ao salvar a configuração do agente." };
  }

  // Auditado porque mexer no teto é mexer em quanto o cliente pode gastar — e
  // quando a fatura surpreender alguém, a pergunta será quem subiu o teto e
  // quando.
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "tenant.agent.update",
    entityType: "TenantAgent",
    entityId: agentCode,
    metadata: dados,
  });

  revalidatePath("/admin/ia");
  return { success: true };
}

/** Volta o agente ao padrão do catálogo, apagando o override. */
export async function restaurarPadraoDoAgente(agentCode: string): Promise<AgenteState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para configurar agentes de IA." };
  if (!agenteDoCatalogo(agentCode)) return { error: "Agente desconhecido." };

  const prisma = getPrisma();
  await prisma.tenantAgent.deleteMany({ where: { tenantId: ctx.tenantId, agentCode } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "tenant.agent.reset",
    entityType: "TenantAgent",
    entityId: agentCode,
  });

  revalidatePath("/admin/ia");
  return { success: true };
}
