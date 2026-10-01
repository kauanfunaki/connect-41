import { getPrisma } from "@/lib/prisma";
import { getActiveSectors } from "@/lib/sectors";
import { assuntosPadraoDoTenant } from "./regras";

export type AssuntoDaSolicitacao = {
  id: string;
  label: string;
  description: string | null;
  sectorCode: string;
  responseDays: number;
};

/**
 * Cria os assuntos padrão na primeira vez que o tenant precisa deles.
 *
 * "Nenhum assunto, nem desativado" quer dizer que nunca foram criados: o admin
 * desativa em vez de apagar, então zero linhas não acontece depois do primeiro
 * uso. O `skipDuplicates` cobre duas telas abrindo juntas pela primeira vez.
 */
export async function garantirAssuntosPadrao(tenantId: string): Promise<void> {
  const prisma = getPrisma();
  if ((await prisma.serviceRequestSubject.count({ where: { tenantId } })) > 0) return;
  const setores = (await getActiveSectors(tenantId)).map((s) => s.code);
  const padrao = assuntosPadraoDoTenant(setores);
  if (padrao.length === 0) return;
  await prisma.serviceRequestSubject.createMany({
    data: padrao.map((a, i) => ({ tenantId, ...a, order: i })),
    skipDuplicates: true,
  });
}

/** Os assuntos que o cliente pode escolher, na ordem do admin. */
export async function assuntosAtivos(tenantId: string): Promise<AssuntoDaSolicitacao[]> {
  await garantirAssuntosPadrao(tenantId);
  return getPrisma().serviceRequestSubject.findMany({
    where: { tenantId, active: true },
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: { id: true, label: true, description: true, sectorCode: true, responseDays: true },
  });
}
