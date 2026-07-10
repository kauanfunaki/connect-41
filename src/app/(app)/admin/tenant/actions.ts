"use server";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";

export type TenantState = { error: string } | { success: true } | null;

export async function atualizarTenant(
  _prev: TenantState,
  form: FormData
): Promise<TenantState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para editar dados do tenant." };

  const name = (form.get("name") as string)?.trim();
  const cnpj = (form.get("cnpj") as string)?.trim() || null;

  if (!name) return { error: "Nome é obrigatório" };

  const prisma = getPrisma();

  // plan/active são configuração de plataforma (cobrança, suspensão) — só o suporte
  // cross-tenant (SUPER_ADMIN) altera; ADMIN do próprio tenant não deve poder se reativar.
  const data: { name: string; cnpj: string | null; plan?: string; active?: boolean } = { name, cnpj };
  if (ctx.role === "SUPER_ADMIN") {
    const plan = (form.get("plan") as string)?.trim();
    if (plan) data.plan = plan;
    data.active = form.get("active") === "on";
  }

  try {
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Já existe um tenant com este CNPJ." };
    console.error("[atualizarTenant]", err);
    return { error: "Erro ao atualizar dados do tenant." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "tenant.update", entityType: "Tenant", entityId: ctx.tenantId, metadata: { name } });

  revalidatePath("/admin/tenant");
  return { success: true };
}
