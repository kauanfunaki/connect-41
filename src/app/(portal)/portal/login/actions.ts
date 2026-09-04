"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signPortalAccess } from "@/lib/auth/jwt";
import { PORTAL_COOKIE } from "@/lib/auth/portal";

export type EstadoDoLogin = { erro: string } | null;

/**
 * Entrada do cliente no portal.
 *
 * Deliberadamente separado de `/api/auth/login`: são duas tabelas de identidade
 * e dois cookies, e um caminho só que decidisse "é User ou PortalUser?" seria
 * exatamente o lugar onde a separação vazaria.
 *
 * A mensagem de erro é a mesma para e-mail inexistente e senha errada — dizer
 * qual dos dois falhou transforma a tela de login num verificador de quais
 * clientes existem.
 */
export async function entrarNoPortal(_anterior: EstadoDoLogin, form: FormData): Promise<EstadoDoLogin> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({
    where: { email, active: true },
    select: { id: true, tenantId: true, clientGroupId: true, passwordHash: true },
  });

  // A verificação roda mesmo sem conta, contra um hash descartável, para o
  // tempo de resposta não denunciar quais e-mails existem.
  const hash = conta?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
  const ok = await verifyPassword(senha, hash);
  if (!conta || !ok) return { erro: "E-mail ou senha inválidos." };

  const token = signPortalAccess({
    kind: "portal",
    sub: conta.id,
    tenantId: conta.tenantId,
    clientGroupId: conta.clientGroupId,
  });

  const store = await cookies();
  store.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  await prisma.portalUser.update({ where: { id: conta.id }, data: { lastLoginAt: new Date() } });

  redirect("/portal");
}

export async function sairDoPortal(): Promise<void> {
  const store = await cookies();
  store.delete(PORTAL_COOKIE);
  redirect("/portal/login");
}
