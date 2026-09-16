// A leitura de centro de custo que as portas de entrada do financeiro
// compartilham. A regra é pura e mora em `centroDeCusto.ts`; aqui só a busca.

import { getPrisma } from "@/lib/prisma";
import { centroDoLancamento, type CentroConhecido } from "./centroDeCusto";

/**
 * O centro com que um lançamento nasce, lido do banco: o informado ou, sem ele,
 * o padrão da contraparte. Busca só os dois ids envolvidos — com `tenantId` no
 * `where`, e a empresa conferida pela regra.
 */
export async function centroNaCriacao(p: {
  tenantId: string;
  companyId: string;
  informadoId: string | null;
  padraoDaContraparteId: string | null;
}): Promise<{ ok: true; centroId: string | null } | { ok: false; erro: string }> {
  const ids = [p.informadoId, p.padraoDaContraparteId].filter((x): x is string => !!x);
  const centros = ids.length
    ? await getPrisma().costCenter.findMany({
        where: { tenantId: p.tenantId, id: { in: ids } },
        select: { id: true, companyId: true, active: true },
      })
    : [];
  return centroDoLancamento({
    companyId: p.companyId,
    informadoId: p.informadoId,
    padraoDaContraparteId: p.padraoDaContraparteId,
    centros: new Map<string, CentroConhecido>(centros.map((c) => [c.id, c])),
  });
}

/** Centros ativos de uma empresa, para os seletores. Inativo não se escolhe. */
export async function centrosAtivosDaEmpresa(tenantId: string, companyId: string): Promise<{ id: string; nome: string; codigo: string | null }[]> {
  const centros = await getPrisma().costCenter.findMany({
    where: { tenantId, companyId, active: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return centros.map((c) => ({ id: c.id, nome: c.name, codigo: c.code }));
}
