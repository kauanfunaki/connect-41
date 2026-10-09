import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { getEnabledModuleCodes } from "@/lib/modules";
import type { PortalAccessTokenPayload } from "@/lib/auth/types";
import { alcanceDoCliente } from "./alcance";

/** Teto de contas com o mesmo e-mail: cada uma custa um bcrypt no login por senha. */
export const MAX_CONTAS_POR_EMAIL = 10;

/**
 * Os acessos ativos com um e-mail, em todos os escritórios — a regra do login
 * desde 16/09, agora também a do "Entrar com o Google" (05/10/2026): um acesso
 * entra direto, mais de um vira escolha.
 */
export async function contasAtivasDoPortal(email: string): Promise<{ id: string; tenantId: string; clientGroupId: string }[]> {
  return getPrisma().portalUser.findMany({
    where: { email, active: true },
    orderBy: { createdAt: "asc" },
    take: MAX_CONTAS_POR_EMAIL,
    select: { id: true, tenantId: true, clientGroupId: true },
  });
}

/**
 * A sessão do portal, se o token vale **e** a conta continua ativa.
 *
 * Com o "lembrar de mim" (05/10/2026) o token vive 30 dias: confiar só nele
 * deixaria uma conta desativada lendo o portal por um mês. O layout da área do
 * cliente e o login passam por aqui; as ações que escrevem já conferiam
 * (`clienteAtivoDoPortal`).
 */
export async function sessaoAtivaDoPortal(): Promise<PortalAccessTokenPayload | null> {
  const sessao = await getPortalSession();
  if (!sessao) return null;
  const ativa = await getPrisma().portalUser.findFirst({
    where: { id: sessao.sub, tenantId: sessao.tenantId, clientGroupId: sessao.clientGroupId, active: true },
    select: { id: true },
  });
  return ativa ? sessao : null;
}

/**
 * O cliente que está **escrevendo** pelo portal: sessão, empresas e módulos,
 * conferindo no banco que a conta continua ativa.
 *
 * As telas só de leitura confiam no token até ele expirar. Quem responde uma
 * pendência ou aprova um pagamento não pode: uma conta desativada hoje de manhã
 * ainda tem token válido à tarde, e aprovar pagamento com ela seria justamente o
 * estrago que desativar pretendia evitar.
 *
 * Devolve `null` em vez de redirecionar — é chamado de server action e de rota,
 * que respondem erro, não navegação.
 */
export async function clienteAtivoDoPortal() {
  const sessao = await getPortalSession();
  if (!sessao) return null;
  const prisma = getPrisma();
  const usuario = await prisma.portalUser.findFirst({
    where: { id: sessao.sub, tenantId: sessao.tenantId, clientGroupId: sessao.clientGroupId, active: true },
    // O e-mail é a ponte com os envios ao cliente (08/10/2026): é por ele que o
    // portal acha — ou cria — a linha de destinatário da pessoa.
    select: { id: true, name: true, email: true },
  });
  if (!usuario) return null;
  const [alcance, modulos] = await Promise.all([alcanceDoCliente(sessao), getEnabledModuleCodes(sessao.tenantId)]);
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  return { sessao, tenantId: sessao.tenantId, usuario, companyIds, modulos };
}
