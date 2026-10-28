// O Omie como emissor de NFS-e: o contrato de ./emissor.ts sobre o que já
// existia em `@/lib/integracoes/omie/emissaoServidor`. Nada de regra nova aqui
// — a emissão, o cancelamento e o acompanhamento continuam lá.

import { getPrisma } from "@/lib/prisma";
import { instanciaDaEmpresa } from "@/lib/integracoes/omie/contas";
import {
  acompanharEmissoes,
  buscarTomadores,
  cancelarEmissao,
  emitirNfse,
  listarEmissoes,
  listasParaEmitir,
} from "@/lib/integracoes/omie/emissaoServidor";
import type { EmissorDeNfse } from "./emissor";

export const emissorOmie: EmissorDeNfse = {
  provedor: "omie",
  nome: "Omie",
  entidade: "OmieEmissao",

  async atendeAEmpresa(tenantId, companyId) {
    const conta = await getPrisma().tenantIntegration.findUnique({
      where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "omie", instanceKey: instanciaDaEmpresa(companyId) } },
      select: { id: true },
    });
    return conta !== null;
  },

  async empresaDaEmissao(tenantId, emissaoId) {
    const e = await getPrisma().omieEmissao.findFirst({ where: { id: emissaoId, tenantId }, select: { companyId: true } });
    return e?.companyId ?? null;
  },

  listas: (tenantId, companyId, atualizar) => listasParaEmitir(tenantId, companyId, atualizar),
  buscarTomadores: (tenantId, companyId, termo) => buscarTomadores(tenantId, companyId, termo),
  emitir: (p) => emitirNfse(p),
  cancelar: (p) => cancelarEmissao(p),
  listarEmissoes: (tenantId, companyId) => listarEmissoes(tenantId, companyId),
  acompanhar: (agora) => acompanharEmissoes(agora),
};
