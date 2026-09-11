"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { integracaoDoCatalogo } from "@/lib/integracoes/catalogo";
import { salvarIntegracao } from "@/lib/integracoes/data";

export type ConexaoState = { error: string } | { success: true } | null;

/**
 * Salva uma conexão da vitrine.
 *
 * Credencial de sistema de terceiro é configuração do cliente inteiro, não de
 * setor — mesmo critério da chave de IA e do Chatwoot.
 */
export async function salvarConexao(_prev: ConexaoState, form: FormData): Promise<ConexaoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para configurar integrações." };

  const code = String(form.get("code") ?? "");
  const def = integracaoDoCatalogo(code);
  if (!def) return { error: "Integração desconhecida." };

  const instanceKey = String(form.get("instanceKey") ?? "default") || "default";

  // Só os campos que o catálogo declara. Ler o FormData inteiro deixaria
  // qualquer campo extra do navegador entrar na configuração cifrada.
  const campos: Record<string, unknown> = {};
  for (const c of def.campos) {
    const v = form.get(c.name);
    if (typeof v === "string") campos[c.name] = v;
  }

  const r = await salvarIntegracao({
    tenantId: ctx.tenantId,
    code,
    instanceKey,
    enabled: form.get("enabled") === "on",
    campos,
  });

  if (!r.ok) return { error: r.erro };

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "integration.save",
    entityType: "TenantIntegration",
    entityId: r.id,
    // Nunca o valor: o metadata do log vai para o banco em texto, e é lido por
    // quem audita. O que importa aqui é quais campos mudaram, não o que eles
    // passaram a valer.
    metadata: { code, instanceKey, camposEnviados: Object.keys(campos) },
  });

  revalidatePath("/admin/integracoes");
  return { success: true };
}
