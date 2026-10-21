// O modelo do DRE de uma empresa (21/10/2026) — a leitura do banco.
//
// Separado de `estrutura.ts` porque lá é código puro, usado também no
// navegador; aqui é consulta.

import { getPrisma } from "@/lib/prisma";
import { modeloDoCodigo, type ModeloDoDre } from "@/lib/dre/estrutura";

/** O modelo que a empresa escolheu — o padrão quando ela não escolheu nenhum. */
export async function modeloDaEmpresa(tenantId: string, companyId: string): Promise<ModeloDoDre> {
  const empresa = await getPrisma().company.findFirst({ where: { id: companyId, tenantId }, select: { dreModelo: true } });
  return modeloDoCodigo(empresa?.dreModelo);
}

/** O modelo que quem chama já sabe, ou o da empresa. Para os loaders não lerem duas vezes. */
export function modeloDaEmpresaOu(tenantId: string, companyId: string, modelo: ModeloDoDre | undefined): Promise<ModeloDoDre> {
  return modelo ? Promise.resolve(modelo) : modeloDaEmpresa(tenantId, companyId);
}
