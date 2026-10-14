// O que o portal de vagas de um escritório lê do banco: o escritório (ativo)
// e as vagas abertas e públicas dele. Um lugar só para a lista de
// `/carreiras/<escritorio>`, o hub do 41 Carreiras e o sitemap — a regra de
// quais vagas aparecem é `whereDasVagasDoPortal`.

import { getPrisma } from "@/lib/prisma";
import { localDaVaga, whereDasVagasDoPortal } from "./portal";

/** O escritório do portal pelo slug — null se não existe ou está inativo. */
export async function escritorioDoPortal(slug: string) {
  const tenant = await getPrisma().tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, logoUrl: true, active: true },
  });
  return tenant && tenant.active ? tenant : null;
}

/** As vagas abertas e públicas do escritório, das mais novas às mais antigas, prontas para a lista e os filtros. */
export async function vagasAbertasDoPortal(tenantId: string, agora: Date = new Date()) {
  const abertas = await getPrisma().vaga.findMany({
    // Prazo vencido sai da lista sozinho — ver `whereDoPrazo`.
    where: whereDasVagasDoPortal(tenantId, agora),
    select: {
      id: true,
      title: true,
      quantity: true,
      openedAt: true,
      publicDescription: true,
      applicationDeadline: true,
      workCity: true,
      workStateCode: true,
      salaryMin: true,
      salaryMax: true,
      showSalary: true,
      workMode: true,
      contractType: true,
      company: { select: { tradeName: true, name: true, city: true, stateCode: true } },
      cargo: { select: { name: true } },
    },
    orderBy: { openedAt: "desc" },
  });

  return abertas.map((v) => ({
    ...v,
    empresa: v.company.tradeName || v.company.name,
    ...localDaVaga(v),
    area: v.cargo?.name ?? null,
    salaryMin: v.salaryMin === null ? null : v.salaryMin.toNumber(),
    salaryMax: v.salaryMax === null ? null : v.salaryMax.toNumber(),
  }));
}

export type VagaAberta = Awaited<ReturnType<typeof vagasAbertasDoPortal>>[number];
