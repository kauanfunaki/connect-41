"use server";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { verifySmtpConnection, type SmtpTestConfig } from "@/lib/email/sendMail";

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

export type SmtpConfigState = { error: string } | { success: true } | null;

// Senha em branco no "Salvar" mantém a senha já cadastrada (padrão comum de UI
// pra segredos: nunca reexibe o valor, só permite trocar). No "Testar conexão"
// o mesmo vazio é resolvido decriptando a senha já salva do tenant.
export async function atualizarSmtp(_prev: SmtpConfigState, form: FormData): Promise<SmtpConfigState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para editar configuração de e-mail." };

  const host = (form.get("host") as string)?.trim();
  const portRaw = (form.get("port") as string)?.trim();
  const secure = form.get("secure") === "on";
  const username = (form.get("username") as string)?.trim();
  const password = (form.get("password") as string) ?? "";
  const fromName = (form.get("fromName") as string)?.trim();
  const fromEmail = (form.get("fromEmail") as string)?.trim();

  const port = Number(portRaw);
  if (!host) return { error: "Host é obrigatório." };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Porta inválida." };
  if (!username) return { error: "Usuário é obrigatório." };
  if (!fromName) return { error: "Nome de exibição é obrigatório." };
  if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) return { error: "E-mail de remetente inválido." };

  const prisma = getPrisma();
  const existing = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId: ctx.tenantId } });
  if (!password && !existing) return { error: "Senha é obrigatória no primeiro cadastro." };

  const passwordEnc = password ? encryptSecret(password) : existing!.passwordEnc;

  try {
    await prisma.tenantSmtpConfig.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, host, port, secure, username, passwordEnc, fromName, fromEmail },
      update: { host, port, secure, username, passwordEnc, fromName, fromEmail },
    });
  } catch (err) {
    console.error("[atualizarSmtp]", err);
    return { error: "Erro ao salvar configuração de e-mail." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "tenant.smtp.update", entityType: "Tenant", entityId: ctx.tenantId, metadata: { host, username, fromEmail } });

  revalidatePath("/admin/tenant");
  return { success: true };
}

export async function testarConexaoSmtp(input: Omit<SmtpTestConfig, "password"> & { password: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { ok: false, error: "Sem permissão." };

  let password = input.password;
  if (!password) {
    const prisma = getPrisma();
    const existing = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!existing) return { ok: false, error: "Informe a senha para testar (nenhuma senha salva ainda)." };
    password = decryptSecret(existing.passwordEnc);
  }

  return verifySmtpConnection({ host: input.host, port: input.port, secure: input.secure, username: input.username, password });
}
