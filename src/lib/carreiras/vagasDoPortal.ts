// O que o portal de vagas de um escritório lê do banco: o escritório (ativo)
// e as vagas abertas e públicas dele. Um lugar só para a lista de
// `/carreiras/<escritorio>`, o hub do 41 Carreiras e o sitemap — a regra de
// quais vagas aparecem é `whereDasVagasDoPortal`.

import { getPrisma } from "@/lib/prisma";
import { localDaVaga, whereDasVagasDoPortal } from "./portal";
import { requisitosPublicos } from "./apresentacao";

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
      companyId: true,
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
      company: { select: { tradeName: true, name: true, city: true, stateCode: true, logoUrl: true } },
      cargo: { select: { name: true } },
    },
    orderBy: { openedAt: "desc" },
  });

  return abertas.map(({ company, ...v }) => ({
    ...v,
    // O endereço do logo é interno (rota com sessão): não vai para a tela. A
    // tela usa `/api/carreiras/logo/<escritorio>/<vaga>`, que só serve o logo
    // da empresa de uma vaga publicada.
    company: { tradeName: company.tradeName, name: company.name, city: company.city, stateCode: company.stateCode },
    temLogo: !!company.logoUrl,
    empresa: company.tradeName || company.name,
    ...localDaVaga({ ...v, company }),
    area: v.cargo?.name ?? null,
    salaryMin: v.salaryMin === null ? null : v.salaryMin.toNumber(),
    salaryMax: v.salaryMax === null ? null : v.salaryMax.toNumber(),
  }));
}

export type VagaAberta = Awaited<ReturnType<typeof vagasAbertasDoPortal>>[number];

/**
 * Uma vaga aberta e pública do escritório, com tudo que a página dela (e o
 * painel ao lado da lista) mostra: a descrição, os benefícios e os requisitos
 * — só o texto deles, sem o peso da triagem. Null se a vaga não está no
 * portal (encerrada, interna, fora do prazo ou de outro escritório).
 */
export async function vagaDoPortal(tenantId: string, vagaId: string, agora: Date = new Date()) {
  const prisma = getPrisma();
  const vaga = await prisma.vaga.findFirst({
    where: { id: vagaId, ...whereDasVagasDoPortal(tenantId, agora) },
    select: {
      id: true,
      companyId: true,
      title: true,
      quantity: true,
      openedAt: true,
      publicDescription: true,
      salaryMin: true,
      salaryMax: true,
      showSalary: true,
      workMode: true,
      contractType: true,
      benefits: true,
      applicationDeadline: true,
      workCity: true,
      workStateCode: true,
      company: { select: { tradeName: true, name: true, city: true, stateCode: true, logoUrl: true } },
      cargo: { select: { name: true } },
    },
  });
  if (!vaga) return null;

  const requisitos = await prisma.vagaRequisitos.findFirst({
    where: { tenantId, vagaId: vaga.id },
    orderBy: { versao: "desc" },
    select: { itens: true },
  });

  const { company, ...v } = vaga;
  return {
    ...v,
    company: { tradeName: company.tradeName, name: company.name, city: company.city, stateCode: company.stateCode },
    temLogo: !!company.logoUrl,
    empresa: company.tradeName || company.name,
    ...localDaVaga({ ...v, company }),
    area: v.cargo?.name ?? null,
    salaryMin: v.salaryMin === null ? null : v.salaryMin.toNumber(),
    salaryMax: v.salaryMax === null ? null : v.salaryMax.toNumber(),
    requisitos: requisitosPublicos(requisitos?.itens),
  };
}

export type VagaDetalhada = NonNullable<Awaited<ReturnType<typeof vagaDoPortal>>>;
