// O plano de contas de uma empresa — a regra num lugar só.
//
// ─── Como o plano de uma empresa se monta (25/09) ────────────────────────────
//
// 1. O **plano padrão do escritório**: categorias sem empresa (`companyId`
//    nulo). Toda empresa herda.
// 2. **Menos** o que a empresa escondeu do padrão (`FinanceCategoryHidden`):
//    o cliente que não tem frota não precisa ver "Pneus" no seletor.
// 3. **Mais** as categorias só dela (`companyId` = a empresa): criadas à mão no
//    plano da empresa ou trazidas do Omie dela.
//
// A linha da DRE de cada uma continua como antes: `dreGroup` da categoria,
// trocado por empresa em `DreCategoryMapping`.
//
// Todo seletor de categoria de uma empresa passa por `ondeDaEmpresa`, e toda
// conferência de "esta categoria vale para esta empresa?" por
// `categoriaDaEmpresa`. Consulta escrita à mão com só `{ tenantId }` voltaria a
// mostrar o plano de um cliente no seletor do outro.

import type { Prisma } from "@/generated/prisma/client";
import type { FinanceEntryKind } from "@/generated/prisma/enums";

/** O `scope` do unique: vazio no padrão, o id da empresa na categoria dela. */
export function escopoDa(companyId: string | null | undefined): string {
  return companyId ?? "";
}

/**
 * O `where` das categorias que valem para a empresa.
 *
 * `incluirOcultas` serve à tela do plano da empresa, que precisa mostrar o que
 * foi escondido para permitir desfazer. Seletor nunca passa isso.
 */
export function ondeDaEmpresa(
  tenantId: string,
  companyId: string,
  opcoes: { kind?: FinanceEntryKind; apenasAtivas?: boolean; incluirOcultas?: boolean } = {}
): Prisma.FinanceCategoryWhereInput {
  return {
    tenantId,
    OR: [{ companyId: null }, { companyId }],
    ...(opcoes.kind ? { kind: opcoes.kind } : {}),
    ...(opcoes.apenasAtivas === false ? {} : { active: true }),
    ...(opcoes.incluirOcultas ? {} : { ocultaEm: { none: { companyId } } }),
  };
}

/** O `where` do plano padrão do escritório. */
export function ondeDoPadrao(tenantId: string): Prisma.FinanceCategoryWhereInput {
  return { tenantId, companyId: null };
}

/**
 * A categoria vale para a empresa? Para as actions conferirem o id que veio
 * do formulário: sem isto, um id de categoria de outro cliente passaria.
 * Categoria escondida conta como não valendo — o seletor já não a oferece.
 */
export function categoriaDaEmpresa(
  tenantId: string,
  companyId: string,
  id: string,
  kind?: FinanceEntryKind
): Prisma.FinanceCategoryWhereInput {
  return { id, ...ondeDaEmpresa(tenantId, companyId, { kind, apenasAtivas: false }) };
}

type CategoriaComNome = { name: string; companyId: string | null };

/**
 * Ordena o padrão antes das categorias da empresa, para quem monta um mapa por
 * nome deixar a da empresa sobrescrever. Quando a empresa tem uma categoria
 * própria com o nome de uma do padrão (acontece com o plano trazido do Omie:
 * "Salários" nos dois), a dela ganha — é a particularidade do cliente. O
 * de-para da DRE é por nome, então sem isto a ordem da consulta decidiria.
 */
export function padraoAntesDaEmpresa<T extends CategoriaComNome>(categorias: T[]): T[] {
  return [...categorias].sort((a, b) => Number(a.companyId !== null) - Number(b.companyId !== null));
}
