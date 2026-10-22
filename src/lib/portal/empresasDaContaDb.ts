// Leitura do banco da regra de `empresasDaConta.ts`: as empresas de uma conta
// do portal e as contas de cada empresa (14/10/2026).
//
// A volta para a regra do Cliente, quando a tabela `portal_user_companies`
// ainda não existia, saiu em 21/10/2026 com o Cliente (etapa 3): a migration
// 20261014210000 rodou em produção em 15/10, e vem antes da desta etapa.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { nomeExibicao } from "@/lib/companyName";
import { contasDaEmpresa, empresasDaConta, nomeDoAcesso, type Via } from "./empresasDaConta";

/** O cliente do Prisma, ou o de uma transação. */
export type BancoDoPortal = Prisma.TransactionClient;

const CAMPOS_DA_REGRA = { id: true, tenantId: true, parentCompanyId: true, status: true } as const;

function banco(db?: BancoDoPortal): BancoDoPortal {
  return db ?? (getPrisma() as unknown as BancoDoPortal);
}

/**
 * As empresas que a conta enxerga, com o caminho de cada uma (direto ou pela
 * matriz). É a régua de todo o portal (`alcanceDoCliente`).
 */
export async function lerEmpresasDaConta(tenantId: string, portalUserId: string, db?: BancoDoPortal): Promise<Map<string, Via>> {
  const prisma = banco(db);
  const ligacoes = await prisma.portalUserCompany.findMany({
    where: { tenantId, portalUserId },
    select: { companyId: true, incluiFiliais: true },
  });
  if (ligacoes.length === 0) return new Map();

  const ids = ligacoes.map((l) => l.companyId);
  const comFiliais = ligacoes.filter((l) => l.incluiFiliais).map((l) => l.companyId);
  const empresas = await prisma.company.findMany({
    where: {
      tenantId,
      OR: [{ id: { in: ids } }, ...(comFiliais.length > 0 ? [{ parentCompanyId: { in: comFiliais } }] : [])],
    },
    select: CAMPOS_DA_REGRA,
    orderBy: { name: "asc" },
  });
  return empresasDaConta(tenantId, ligacoes, empresas);
}

/** Só os ids — o que as telas do portal filtram. */
export async function idsDasEmpresasDaConta(tenantId: string, portalUserId: string, db?: BancoDoPortal): Promise<string[]> {
  return [...(await lerEmpresasDaConta(tenantId, portalUserId, db)).keys()];
}

/**
 * As contas que enxergam cada empresa, com o caminho (direto ou pela matriz).
 * Todas as contas, ativas ou não — quem avisa filtra as ativas.
 */
export async function lerContasDasEmpresas(
  tenantId: string,
  companyIds: readonly string[],
  db?: BancoDoPortal
): Promise<Map<string, Map<string, Via>>> {
  const saida = new Map<string, Map<string, Via>>(companyIds.map((id) => [id, new Map()]));
  if (companyIds.length === 0) return saida;
  const prisma = banco(db);

  const empresas = await prisma.company.findMany({
    where: { tenantId, id: { in: [...companyIds] } },
    select: CAMPOS_DA_REGRA,
  });
  const matrizIds = [...new Set(empresas.map((e) => e.parentCompanyId).filter((m): m is string => !!m))];

  const ligacoes = await prisma.portalUserCompany.findMany({
    where: {
      tenantId,
      OR: [
        { companyId: { in: [...companyIds] } },
        ...(matrizIds.length > 0 ? [{ companyId: { in: matrizIds }, incluiFiliais: true }] : []),
      ],
    },
    select: { portalUserId: true, companyId: true, incluiFiliais: true },
  });

  const matrizes =
    matrizIds.length > 0 ? await prisma.company.findMany({ where: { tenantId, id: { in: matrizIds } }, select: { id: true, tenantId: true } }) : [];
  const matrizPorId = new Map(matrizes.map((m) => [m.id, m]));
  for (const e of empresas) {
    const matriz = e.parentCompanyId ? (matrizPorId.get(e.parentCompanyId) ?? null) : null;
    saida.set(e.id, contasDaEmpresa(e, matriz, ligacoes));
  }
  return saida;
}

export type UsuarioDoPortal = { id: string; name: string; email: string };

/**
 * Os acessos ATIVOS que enxergam alguma das empresas — quem recebe e-mail e
 * aviso no celular. Uma pessoa com várias das empresas aparece uma vez só.
 */
export async function usuariosAtivosDasEmpresas(tenantId: string, companyIds: readonly string[], db?: BancoDoPortal): Promise<UsuarioDoPortal[]> {
  if (companyIds.length === 0) return [];
  const porEmpresa = await lerContasDasEmpresas(tenantId, companyIds, db);
  const ids = new Set<string>();
  for (const contas of porEmpresa.values()) for (const id of contas.keys()) ids.add(id);
  if (ids.size === 0) return [];
  return banco(db).portalUser.findMany({
    where: { tenantId, id: { in: [...ids] }, active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/**
 * O nome do acesso no portal (topo do menu e Início) — era o nome do Cliente.
 * A empresa, quando é uma; a primeira e quantas mais, quando são várias.
 */
export async function nomeDoAcessoNoPortal(tenantId: string, portalUserId: string): Promise<string | null> {
  const ids = await idsDasEmpresasDaConta(tenantId, portalUserId);
  if (ids.length === 0) return null;
  const empresas = await getPrisma().company.findMany({
    where: { tenantId, id: { in: ids } },
    select: { name: true, displayName: true },
  });
  return nomeDoAcesso(empresas.map((e) => nomeExibicao(e)));
}

/**
 * O nome de cada conta na escolha do login ("Este e-mail tem acesso a mais de
 * um cliente") — era o nome do Cliente. São no máximo 10 contas por e-mail
 * (`MAX_CONTAS_POR_EMAIL`).
 */
export async function nomesDasContasNoLogin(contas: readonly { id: string; tenantId: string }[]): Promise<Map<string, string>> {
  const nomes = await Promise.all(contas.map(async (c) => [c.id, (await nomeDoAcessoNoPortal(c.tenantId, c.id)) ?? "Sem empresa ligada"] as const));
  return new Map(nomes);
}

/** Uma empresa ligada direto a um acesso, para a lista e o "Editar". */
export type EmpresaLigada = { id: string; nome: string; incluiFiliais: boolean; filiais: number };

/**
 * As empresas ligadas direto a cada conta (sem as que vêm pela matriz), com
 * quantas filiais cada uma tem — o que Administração › Portal do cliente
 * mostra e edita.
 */
export async function empresasLigadasDasContas(
  tenantId: string,
  contas: readonly { id: string }[]
): Promise<Map<string, EmpresaLigada[]>> {
  const saida = new Map<string, EmpresaLigada[]>(contas.map((c) => [c.id, []]));
  if (contas.length === 0) return saida;
  const prisma = getPrisma();
  const campos = { id: true, name: true, displayName: true, _count: { select: { filiais: true } } } as const;
  const ligacoes = await prisma.portalUserCompany.findMany({
    where: { tenantId, portalUserId: { in: contas.map((c) => c.id) }, company: { tenantId } },
    select: { portalUserId: true, incluiFiliais: true, company: { select: campos } },
  });
  for (const l of ligacoes) {
    saida.get(l.portalUserId)?.push({ id: l.company.id, nome: nomeExibicao(l.company), incluiFiliais: l.incluiFiliais, filiais: l.company._count.filiais });
  }
  for (const lista of saida.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return saida;
}
