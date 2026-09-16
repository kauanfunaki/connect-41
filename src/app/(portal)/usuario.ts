import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { getEnabledModuleCodes } from "@/lib/modules";
import { alcanceDoCliente } from "./alcance";

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
    select: { id: true, name: true },
  });
  if (!usuario) return null;
  const [alcance, modulos] = await Promise.all([alcanceDoCliente(sessao), getEnabledModuleCodes(sessao.tenantId)]);
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  return { sessao, tenantId: sessao.tenantId, usuario, companyIds, modulos };
}
