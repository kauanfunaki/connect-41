"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { HASH_DESCARTAVEL, verifyPassword } from "@/lib/auth/password";
import { signPortalEscolha, verifyPortalEscolha } from "@/lib/auth/jwt";
import { PORTAL_COOKIE } from "@/lib/auth/portal";
import { cookieDaSessaoDoPortal, querLembrar } from "@/lib/auth/sessaoDoPortal";
import { CAMINHO_DO_COOKIE_DA_ESCOLHA, COOKIE_DA_ESCOLHA } from "@/lib/auth/googleDoPortal";
import { MAX_CONTAS_POR_EMAIL } from "@/app/(portal)/usuario";
import { clientIp, hit, reset } from "@/lib/rateLimit";

export type OpcaoDeCliente = { id: string; escritorio: string; cliente: string };

export type EstadoDoLogin =
  | { erro: string }
  /**
   * A senha (ou o Google) conferiu em mais de um cliente: a pessoa escolhe em
   * qual entra. `lembrar` atravessa a escolha num campo escondido.
   */
  | { escolher: { token: string; opcoes: OpcaoDeCliente[]; lembrar: boolean } }
  | null;

const ERRO = "E-mail ou senha inválidos.";
const MUITAS_TENTATIVAS = "Muitas tentativas. Tente de novo em alguns minutos.";

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
 *
 * ─── Lembrar de mim (05/10/2026) ────────────────────────────────────────────
 *
 * A caixa decide a duração da sessão: 12 h sem ela, 30 dias com ela (ver
 * `sessaoDoPortal.ts`). A escolha de cliente que vem do Google também termina
 * aqui, no segundo passo.
 *
 * ─── Tentativas (08/10/2026) ────────────────────────────────────────────────
 *
 * O mesmo limite da entrada da equipe (`/api/auth/login`): 20 por IP e 5 por
 * e-mail a cada 15 minutos, com chaves próprias do portal para não somar com as
 * da equipe. Até aqui a senha do cliente podia ser descoberta por tentativa. O
 * limite vale antes de olhar o banco, então a resposta é a mesma para e-mail
 * que existe ou não; a senha certa zera o contador do e-mail. O segundo passo
 * (a escolha do cliente) não entra: ele já vem com a prova assinada.
 */
export async function entrarNoPortal(_anterior: EstadoDoLogin, form: FormData): Promise<EstadoDoLogin> {
  const lembrar = querLembrar(form.get("lembrar"));

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
    return iniciarSessao(conta, lembrar);
  }

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const ip = clientIp({ headers: await headers() });
  if (!hit(`portal-login-ip:${ip}`, 20).allowed || !hit(`portal-login-email:${email}`, 5).allowed) {
    return { erro: MUITAS_TENTATIVAS };
  }

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
    // tempo de resposta não denunciar quais e-mails existem. Até 06/10/2026 o
    // hash daqui tinha 65 caracteres — fora do formato, o bcryptjs devolvia
    // `false` sem calcular nada, e o e-mail sem conta respondia ~0,2 s antes.
    await verifyPassword(senha, HASH_DESCARTAVEL);
    return { erro: ERRO };
  }

  const conferem: typeof contas = [];
  for (const conta of contas) {
    if (await verifyPassword(senha, conta.passwordHash)) conferem.push(conta);
  }

  if (conferem.length === 0) return { erro: ERRO };
  reset(`portal-login-email:${email}`);
  if (conferem.length === 1) return iniciarSessao(conferem[0]!, lembrar);

  return {
    escolher: {
      token: signPortalEscolha(conferem.map((c) => c.id)),
      opcoes: conferem.map((c) => ({ id: c.id, escritorio: c.tenant.name, cliente: c.clientGroup.name })),
      lembrar,
    },
  };
}

async function iniciarSessao(
  conta: { id: string; tenantId: string; clientGroupId: string },
  lembrar: boolean
): Promise<never> {
  const sessao = cookieDaSessaoDoPortal(conta, lembrar);
  const store = await cookies();
  store.set(sessao.name, sessao.value, sessao.options);
  // A escolha que veio do Google, se havia, já foi usada.
  if (store.get(COOKIE_DA_ESCOLHA)) store.set(COOKIE_DA_ESCOLHA, "", { path: CAMINHO_DO_COOKIE_DA_ESCOLHA, maxAge: 0 });

  await getPrisma().portalUser.update({ where: { id: conta.id }, data: { lastLoginAt: new Date() } });

  redirect("/portal");
}

export async function sairDoPortal(): Promise<void> {
  const store = await cookies();
  store.delete(PORTAL_COOKIE);
  redirect("/portal/login");
}
