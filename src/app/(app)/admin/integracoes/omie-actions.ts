"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { previaDasNotasOmie, salvarContaOmie, testarContaOmie } from "@/lib/integracoes/omie/contas";

type Resultado = { error: string } | { ok: true; mensagem?: string };

// Credencial de sistema de terceiro é configuração do cliente inteiro — mesmo
// critério de `salvarConexao`: só quem administra o tenant.
async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  if (!isFullWrite(ctx.role)) return null;
  return ctx;
}

export async function salvarContaOmieAction(dados: { companyId: string; appKey: string; appSecret: string }): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sem permissão para configurar integrações." };
  if (!dados.companyId) return { error: "Escolha a empresa." };
  if (!dados.appKey.trim()) return { error: "Informe a App Key." };
  const r = await salvarContaOmie({ tenantId: ctx.tenantId!, ...dados });
  if (!r.ok) return { error: r.erro };
  // Nunca o valor da chave no log — só que a conta da empresa mudou.
  await logAudit({ tenantId: ctx.tenantId!, userId: ctx.userId, action: "integration.omie.conta", entityType: "Company", entityId: dados.companyId });
  revalidatePath("/admin/integracoes");
  return { ok: true };
}

export async function testarContaOmieAction(companyId: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sem permissão para configurar integrações." };
  const r = await testarContaOmie(ctx.tenantId!, companyId);
  revalidatePath("/admin/integracoes");
  if (!r.ok) return { error: r.erro };
  const e = r.empresa;
  return { ok: true, mensagem: e ? `Conectado: ${e.razaoSocial} — CNPJ confere.` : "Conectado." };
}

/** Prévia das notas da conta — só leitura, nada é gravado (Fase 1a). */
export async function previaDasNotasOmieAction(companyId: string) {
  const ctx = await contexto();
  if (!ctx) return { erro: "Sem permissão para configurar integrações." };
  return previaDasNotasOmie(ctx.tenantId!, companyId);
}
