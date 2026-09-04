"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { createPasswordResetToken } from "@/lib/auth/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email/sendMail";

export type EstadoDoAcesso = { erro: string } | { ok: true; aviso?: string } | null;

/**
 * Cria um acesso de cliente ao portal.
 *
 * **Nasce sem senha conhecida**, igual à importação de usuários de 03/09: uma
 * senha aleatória é gerada, cifrada e descartada dentro deste processo. Não
 * existe senha padrão, e ninguém — nem quem cria — sabe qual é. O cliente entra
 * pelo link de definição de senha, que vai por e-mail.
 *
 * Só `isFullWrite`: dar acesso a alguém de fora da 41 não é operação de setor.
 */
export async function criarAcessoDoPortal(_anterior: EstadoDoAcesso, form: FormData): Promise<EstadoDoAcesso> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { erro: "Sem permissão." };

  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const clientGroupId = String(form.get("clientGroupId") ?? "");

  if (!nome) return { erro: "Informe o nome." };
  if (!email.includes("@")) return { erro: "E-mail inválido." };
  if (!clientGroupId) return { erro: "Escolha o cliente que esta conta enxerga." };

  const prisma = getPrisma();

  // O grupo tem de ser deste tenant: o id vem do formulário, ou seja, do
  // cliente HTTP, e sem esta conferência um id de outro tenant daria a um
  // cliente acesso às empresas de outro escritório.
  const grupo = await prisma.clientGroup.findFirst({
    where: { id: clientGroupId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!grupo) return { erro: "Cliente não encontrado." };

  const jaExiste = await prisma.portalUser.findFirst({
    where: { tenantId: ctx.tenantId, email },
    select: { id: true },
  });
  if (jaExiste) return { erro: "Já existe um acesso com este e-mail." };

  const criado = await prisma.portalUser.create({
    data: {
      tenantId: ctx.tenantId,
      clientGroupId: grupo.id,
      name: nome,
      email,
      passwordHash: await hashPassword(randomBytes(32).toString("hex")),
    },
    select: { id: true },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "portal.user.created",
    entityType: "PortalUser",
    entityId: criado.id,
    metadata: { email, clientGroupId: grupo.id },
  });

  revalidatePath("/admin/portal");

  const enviado = await enviarLinkDeSenhaInterno(ctx.tenantId, criado.id, email);
  return enviado
    ? { ok: true }
    : {
        ok: true,
        aviso: "Acesso criado, mas o e-mail não saiu (SMTP do workspace). Use “Enviar link” depois de configurar.",
      };
}

async function enviarLinkDeSenhaInterno(tenantId: string, portalUserId: string, email: string): Promise<boolean> {
  const prisma = getPrisma();
  const smtp = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId } });
  if (!smtp) return false;
  const token = await createPasswordResetToken(portalUserId, "PORTAL_USER");
  const r = await sendPasswordResetEmail({ tenantId, to: email, resetToken: token, destino: "portal" });
  return r.ok;
}

/** Reenvia o link de definição de senha — para quando o primeiro e-mail não chegou. */
export async function enviarLinkDeSenha(portalUserId: string): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { error: "Sem permissão." };

  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({
    where: { id: portalUserId, tenantId: ctx.tenantId },
    select: { id: true, email: true, active: true },
  });
  if (!conta) return { error: "Acesso não encontrado." };
  if (!conta.active) return { error: "Acesso desativado — reative antes de mandar o link." };

  const ok = await enviarLinkDeSenhaInterno(ctx.tenantId, conta.id, conta.email);
  return ok ? { ok: true } : { error: "Não foi possível enviar. Confira o SMTP do workspace." };
}

/** Liga/desliga o acesso. Desativado não entra e não recebe link. */
export async function alternarAcessoDoPortal(portalUserId: string, ativo: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;

  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({
    where: { id: portalUserId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!conta) return;

  await prisma.portalUser.update({ where: { id: conta.id }, data: { active: ativo } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ativo ? "portal.user.enabled" : "portal.user.disabled",
    entityType: "PortalUser",
    entityId: conta.id,
  });
  revalidatePath("/admin/portal");
}
