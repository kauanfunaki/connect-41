import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { getEnabledModuleCodes } from "@/lib/modules";
import type { EscopoFinanceiro } from "@/lib/financeiro/consultas";
import { alcanceDoCliente } from "./alcance";

/**
 * O que toda tela financeira do portal precisa: sessão, escopo e módulos.
 *
 * O escopo sai de `alcanceDoCliente` — o mesmo alcance do acervo fiscal —, e
 * não de uma segunda consulta ao grupo: dois caminhos para "quais empresas
 * este cliente vê" são como um deles fica mais largo que o outro.
 *
 * Os módulos valem para o portal também. Tenant que desligou o fluxo de caixa
 * na equipe não pode tê-lo aberto para o cliente pela porta do portal.
 */
export async function contextoFinanceiroDoPortal() {
  const sessao = await getPortalSession();
  if (!sessao) redirect("/portal/login");

  const prisma = getPrisma();
  const [alcance, modulos, grupo] = await Promise.all([
    alcanceDoCliente(sessao),
    getEnabledModuleCodes(sessao.tenantId),
    prisma.clientGroup.findUnique({ where: { id: sessao.clientGroupId }, select: { name: true } }),
  ]);
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  const escopo: EscopoFinanceiro = { tenantId: sessao.tenantId, companyIds };
  return { sessao, escopo, modulos, grupoNome: grupo?.name ?? null };
}
