"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signPortalAccess, signPortalEscolha, verifyPortalEscolha } from "@/lib/auth/jwt";
import { PORTAL_COOKIE } from "@/lib/auth/portal";

export type OpcaoDeCliente = { id: string; escritorio: string; cliente: string };

export type EstadoDoLogin =
  | { erro: string }
  /** A senha conferiu em mais de um cliente: a pessoa escolhe em qual entra. */
  | { escolher: { token: string; opcoes: OpcaoDeCliente[] } }
  | null;

const ERRO = "E-mail ou senha inválidos.";

/** Teto de contas com o mesmo e-mail: cada uma custa um bcrypt no login. */
const MAX_CONTAS_POR_EMAIL = 10;

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
 *
 * ─── O mesmo e-mail em dois clientes ────────────────────────────────────────
 *
 * O portal é uma URL só, e `PortalUser` é único por (tenant, e-mail). Até
 * 16/09 o login fazia `findFirst({ email })`: com o e-mail em dois tenants, a
 * pessoa entrava no que o banco devolvesse primeiro — ou recebia "senha
 * inválida" com a senha certa da outra conta. Agora a senha é conferida em
 * todas; uma só que confira entra direto, mais de uma vira escolha. A lista só
 * aparece **depois** da senha certa, então não revela quais clientes existem.
 */
export async function entrarNoPortal(_anterior: EstadoDoLogin, form: FormData): Promise<EstadoDoLogin> {
  // Segundo passo: a pessoa escolheu o cliente.
  const tokenDaEscolha = String(form.get("escolha") ?? "");
  if (tokenDaEscolha) {
    const liberadas = verifyPortalEscolha(tokenDaEscolha);
    const escolhida = String(form.get("conta") ?? "");
    if (!liberadas) return { erro: "A escolha expirou. Entre de novo." };
    if (!liberadas.includes(escolhida)) return { erro: "Escolha um dos clientes da lista." };

    const conta = await getPrisma().portalUser.findFirst({
      where: { id: escolhida, active: true },
      select: { id: true, tenantId: true, clientGroupId: true },
    });
    // Desativada entre os dois passos: não entra.
    if (!conta) return { erro: ERRO };
    return iniciarSessao(conta);
  }

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const contas = await getPrisma().portalUser.findMany({
    where: { email, active: true },
    orderBy: { createdAt: "asc" },
    take: MAX_CONTAS_POR_EMAIL,
    select: {
      id: true,
      tenantId: true,
      clientGroupId: true,
      passwordHash: true,
      tenant: { select: { name: true } },
      clientGroup: { select: { name: true } },
    },
  });

  if (contas.length === 0) {
    // A verificação roda mesmo sem conta, contra um hash descartável, para o
    // tempo de resposta não denunciar quais e-mails existem.
    await verifyPassword(senha, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
    return { erro: ERRO };
  }

  const conferem: typeof contas = [];
  for (const conta of contas) {
    if (await verifyPassword(senha, conta.passwordHash)) conferem.push(conta);
  }

  if (conferem.length === 0) return { erro: ERRO };
  if (conferem.length === 1) return iniciarSessao(conferem[0]!);

  return {
    escolher: {
      token: signPortalEscolha(conferem.map((c) => c.id)),
      opcoes: conferem.map((c) => ({ id: c.id, escritorio: c.tenant.name, cliente: c.clientGroup.name })),
    },
  };
}

async function iniciarSessao(conta: { id: string; tenantId: string; clientGroupId: string }): Promise<never> {
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

  await getPrisma().portalUser.update({ where: { id: conta.id }, data: { lastLoginAt: new Date() } });

  redirect("/portal");
}

export async function sairDoPortal(): Promise<void> {
  const store = await cookies();
  store.delete(PORTAL_COOKIE);
  redirect("/portal/login");
}
