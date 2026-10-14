// As empresas do escritório como opções da escolha de empresas de um acesso do
// portal (14/10/2026): Administração › Portal do cliente (novo e editar).

import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { STATUS_OCULTOS_POR_PADRAO } from "@/lib/companyStatusFilter";
import type { EmpresaParaEscolher } from "@/components/portal/EscolhaDeEmpresas";

/** Em ordem de nome, com a matriz de cada filial e quantas filiais cada uma tem. */
export async function opcoesDeEmpresaDoPortal(tenantId: string): Promise<EmpresaParaEscolher[]> {
  const empresas = await getPrisma().company.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      displayName: true,
      cnpj: true,
      status: true,
      parent: { select: { name: true, displayName: true } },
      _count: { select: { filiais: true } },
    },
  });
  return empresas
    .map((e) => ({
      id: e.id,
      nome: nomeExibicao(e),
      cnpj: e.cnpj,
      filiais: e._count.filiais,
      matrizNome: e.parent ? nomeExibicao(e.parent) : null,
      foraDeOperacao: STATUS_OCULTOS_POR_PADRAO.includes(e.status),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
