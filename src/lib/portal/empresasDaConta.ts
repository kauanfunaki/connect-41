// As empresas que um acesso do portal enxerga — e, no sentido contrário, os
// acessos que enxergam uma empresa (14/10/2026, etapa 2 da saída do Cliente).
//
// Até aqui a conta via as empresas do Cliente dela (`clientGroupId`). Agora o
// acesso é ligado direto a N empresas (`PortalUserCompany`), e a regra é esta,
// decidida pelo Kauan em 13/10:
//
// 1. A empresa ligada direto, qualquer que seja o status. É o que a regra do
//    Cliente fazia (empresa inativa do cliente continuava aparecendo, com o
//    histórico dela), e é o que garante que ninguém perde empresa na troca: a
//    migration liga direto todas as empresas que cada conta via.
// 2. Com "incluir filiais" (marcado por padrão), as filiais daquela empresa
//    (`Company.parentCompanyId`) que estão em operação — inclusive as
//    cadastradas depois da ligação. Filial inativa ou cancelada não aparece
//    sozinha: para mostrar uma, liga-se ela direto.
// 3. Um nível só: a filial da filial não entra pela matriz de cima.
// 4. Só empresas do escritório da conta. A consulta já filtra; a regra confere
//    de novo, porque um vazamento entre escritórios é o erro que não pode haver.
//
// As duas perguntas — "o que esta conta vê" (o alcance das ~32 telas do portal)
// e "quem vê esta empresa" (quem recebe e-mail e aviso) — passam pelas funções
// daqui, para nunca discordarem. Puro, sem banco: quem lê as linhas é
// `empresasDaContaDb.ts`.

import type { CompanyStatus } from "@/generated/prisma/enums";
import { STATUS_OCULTOS_POR_PADRAO } from "@/lib/companyStatusFilter";

/** Uma ligação conta ↔ empresa, como está em `portal_user_companies`. */
export type LigacaoDoAcesso = {
  portalUserId: string;
  companyId: string;
  incluiFiliais: boolean;
};

/** O mínimo da empresa que a regra precisa enxergar. */
export type EmpresaDaRegra = {
  id: string;
  tenantId: string;
  parentCompanyId: string | null;
  status: CompanyStatus;
};

/** Como a conta chega à empresa: ligada direto, ou pela matriz (com "incluir filiais"). */
export type Via = { tipo: "direto"; incluiFiliais: boolean } | { tipo: "matriz"; matrizId: string };

/** A filial entra pela matriz? Só em operação — inativa e cancelada, não. */
export function filialEmOperacao(status: CompanyStatus): boolean {
  return !STATUS_OCULTOS_POR_PADRAO.includes(status);
}

/**
 * As empresas de UMA conta, com o caminho de cada uma.
 *
 * `empresas` são as candidatas lidas do banco (as ligadas e as filiais delas);
 * a ordem delas é a do resultado. Ligação para empresa que não veio (de outro
 * escritório, ou apagada) não entra.
 */
export function empresasDaConta(
  tenantId: string,
  ligacoes: readonly Pick<LigacaoDoAcesso, "companyId" | "incluiFiliais">[],
  empresas: readonly EmpresaDaRegra[]
): Map<string, Via> {
  const doEscritorio = empresas.filter((e) => e.tenantId === tenantId);
  const direto = new Map(ligacoes.map((l) => [l.companyId, l.incluiFiliais]));
  const existe = new Set(doEscritorio.map((e) => e.id));

  const saida = new Map<string, Via>();
  for (const e of doEscritorio) {
    const incluiFiliais = direto.get(e.id);
    if (incluiFiliais !== undefined) {
      saida.set(e.id, { tipo: "direto", incluiFiliais });
      continue;
    }
    const matriz = e.parentCompanyId;
    if (matriz && direto.get(matriz) === true && existe.has(matriz) && filialEmOperacao(e.status)) {
      saida.set(e.id, { tipo: "matriz", matrizId: matriz });
    }
  }
  return saida;
}

/** Só os ids, na ordem das candidatas — o alcance do portal. */
export function idsDasEmpresasDaConta(
  tenantId: string,
  ligacoes: readonly Pick<LigacaoDoAcesso, "companyId" | "incluiFiliais">[],
  empresas: readonly EmpresaDaRegra[]
): string[] {
  return [...empresasDaConta(tenantId, ligacoes, empresas).keys()];
}

/**
 * As contas que enxergam UMA empresa, com o caminho de cada uma — o espelho de
 * `empresasDaConta`: a conta X está aqui se e só se a empresa está lá.
 *
 * `matriz` é a matriz da empresa (quando ela é filial), para conferir que é do
 * mesmo escritório; `ligacoes` são as da empresa e as da matriz dela.
 */
export function contasDaEmpresa(
  empresa: EmpresaDaRegra,
  matriz: Pick<EmpresaDaRegra, "id" | "tenantId"> | null,
  ligacoes: readonly LigacaoDoAcesso[]
): Map<string, Via> {
  const saida = new Map<string, Via>();
  for (const l of ligacoes) {
    if (l.companyId === empresa.id) saida.set(l.portalUserId, { tipo: "direto", incluiFiliais: l.incluiFiliais });
  }
  const pelaMatriz =
    !!matriz &&
    empresa.parentCompanyId === matriz.id &&
    matriz.tenantId === empresa.tenantId &&
    filialEmOperacao(empresa.status);
  if (pelaMatriz) {
    for (const l of ligacoes) {
      if (l.companyId === matriz.id && l.incluiFiliais && !saida.has(l.portalUserId)) {
        saida.set(l.portalUserId, { tipo: "matriz", matrizId: matriz.id });
      }
    }
  }
  return saida;
}

/**
 * As ligações que a migration cria para as contas que já existem: todas as
 * empresas do cliente da conta (no mesmo escritório), com as filiais. É o
 * espelho, em TypeScript, do primeiro INSERT de
 * `prisma/migrations/20261014210000_portal_por_empresa` — a prévia
 * (`scripts/previa-portal-por-empresa.ts`) e os testes usam esta, para a
 * conta "hoje × depois" sair da mesma regra que a migration aplica.
 */
export function ligacoesDoPreenchimento(
  conta: { id: string; tenantId: string; clientGroupId: string | null },
  empresas: readonly { id: string; tenantId: string; clientGroupId: string | null }[]
): LigacaoDoAcesso[] {
  if (!conta.clientGroupId) return [];
  return empresas
    .filter((e) => e.tenantId === conta.tenantId && e.clientGroupId === conta.clientGroupId)
    .map((e) => ({ portalUserId: conta.id, companyId: e.id, incluiFiliais: true }));
}

/** O que a conta via pela regra do Cliente (até 14/10/2026): as empresas do cliente dela, no escritório dela. */
export function empresasPeloCliente(
  conta: { tenantId: string; clientGroupId: string | null },
  empresas: readonly { id: string; tenantId: string; clientGroupId: string | null }[]
): string[] {
  if (!conta.clientGroupId) return [];
  return empresas.filter((e) => e.tenantId === conta.tenantId && e.clientGroupId === conta.clientGroupId).map((e) => e.id);
}

/**
 * O nome que o portal mostra para a conta no topo do menu e no Início — era o
 * nome do Cliente. Uma empresa: o nome dela. Várias: a primeira e quantas mais.
 */
export function nomeDoAcesso(nomes: readonly string[]): string | null {
  const ordenados = [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (ordenados.length === 0) return null;
  if (ordenados.length === 1) return ordenados[0]!;
  const mais = ordenados.length - 1;
  return `${ordenados[0]} e mais ${mais} ${mais === 1 ? "empresa" : "empresas"}`;
}
