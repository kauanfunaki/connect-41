import { redirect } from "next/navigation";
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

  const [alcance, modulos] = await Promise.all([alcanceDoCliente(sessao), getEnabledModuleCodes(sessao.tenantId)]);
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  const escopo: EscopoFinanceiro = { tenantId: sessao.tenantId, companyIds };
  return { sessao, escopo, modulos };
}
