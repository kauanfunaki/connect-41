// As consultas de Colaboradores de clientes (14/10/2026): a página de uma
// empresa, o resumo dela e a busca em todas. Nenhuma lê a base inteira — a
// tela abre numa empresa só, e a busca em todas tem teto (`LIMITE_DA_BUSCA`).

import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import type { AuthContext } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { personActiveWhere, type PersonActiveFilter } from "@/lib/personActiveFilter";
import { LIMITE_DA_BUSCA, cortarBusca, ondeDaBusca } from "./busca";
import { resumoDaEmpresa, type ResumoDaEmpresa } from "./resumoDaEmpresa";

/** Colaborador de empresa cliente — não a equipe do escritório, não candidato. */
const DE_CLIENTE = { type: PersonType.COLABORADOR, isInternal: false } as const;

/** O que a linha da tabela mostra. */
const CAMPOS_DA_LINHA = {
  id: true,
  name: true,
  active: true,
  cpf: true,
  email: true,
  photoUrl: true,
  admissionDate: true,
  employmentStatus: true,
  cargo: { select: { name: true } },
  currentCompany: { select: { id: true, name: true, displayName: true } },
} as const;

async function base(ctx: AuthContext) {
  return { ...(await scopedPersonWhere(ctx)), ...DE_CLIENTE };
}

/** Os colaboradores de uma empresa, página a página, com o filtro de cadastro. */
export async function colaboradoresDaEmpresa(
  ctx: AuthContext,
  companyId: string,
  filtro: PersonActiveFilter,
  pagina: { numero: number; tamanho: number }
) {
  const prisma = getPrisma();
  const daEmpresa = { ...(await base(ctx)), currentCompanyId: companyId };
  const where = { ...daEmpresa, ...personActiveWhere(filtro) };
  const [linhas, total, inativos] = await Promise.all([
    prisma.person.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pagina.numero - 1) * pagina.tamanho,
      take: pagina.tamanho,
      select: CAMPOS_DA_LINHA,
    }),
    prisma.person.count({ where }),
    // Quantos inativos ficaram de fora — o aviso "Mostrar todos" da barra.
    filtro.kind === "ativos" ? prisma.person.count({ where: { ...daEmpresa, active: false } }) : Promise.resolve(0),
  ]);
  return { linhas, total, inativos };
}

/**
 * O resumo da empresa (ver `resumoDaEmpresa`). Lê quatro campos de cada pessoa
 * da empresa — dezenas de linhas, não a base — e conta aqui: a data de
 * desligamento vem em dois formatos, e quem decide o dia é `diaDoRegistro`.
 */
export async function lerResumoDaEmpresa(ctx: AuthContext, companyId: string, agora: Date): Promise<ResumoDaEmpresa> {
  const pessoas = await getPrisma().person.findMany({
    where: { ...(await base(ctx)), currentCompanyId: companyId },
    select: { employmentStatus: true, active: true, admissionDate: true, dismissalDate: true },
  });
  return resumoDaEmpresa(pessoas, agora);
}

/**
 * A busca por nome ou CPF em todas as empresas, com teto: pede
 * `LIMITE_DA_BUSCA + 1` para saber se havia mais. Respeita o filtro de
 * cadastro, como a lista da empresa.
 */
export async function buscarEmTodasAsEmpresas(ctx: AuthContext, termo: string, filtro: PersonActiveFilter) {
  const prisma = getPrisma();
  const daBusca = { AND: [await base(ctx), ondeDaBusca(termo)] };
  const [linhas, inativos] = await Promise.all([
    prisma.person.findMany({
      where: { AND: [...daBusca.AND, personActiveWhere(filtro)] },
      orderBy: { name: "asc" },
      take: LIMITE_DA_BUSCA + 1,
      select: CAMPOS_DA_LINHA,
    }),
    filtro.kind === "ativos" ? prisma.person.count({ where: { AND: [...daBusca.AND, { active: false }] } }) : Promise.resolve(0),
  ]);
  return { ...cortarBusca(linhas), inativos };
}

export type LinhaDeColaborador = Awaited<ReturnType<typeof colaboradoresDaEmpresa>>["linhas"][number];
