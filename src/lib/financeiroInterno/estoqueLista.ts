// A lista do Estoque paginada no banco (27/11/2026, melhoria-571).
//
// A tela lia todos os itens e recortava em memória. Os recortes são todos de
// coluna — situação, tipo, quantidade contra o mínimo, data da conferência —,
// então o banco filtra, ordena e entrega só a página. Funções puras: o `where`
// de cada recorte e o da busca. A consulta mora na página.

import type { Prisma } from "@/generated/prisma/client";
import { CONFERIR_A_CADA_DIAS } from "./estoque";

export const RECORTES_DO_ESTOQUE = ["todos", "com-alguem", "repor", "conferir", "baixados"] as const;
export type RecorteDoEstoque = (typeof RECORTES_DO_ESTOQUE)[number];

const ATIVOS: Prisma.InventoryItemWhereInput = { status: { not: "BAIXADO" } };

/** Conferido (ou, se nunca, cadastrado) até este instante: entra em "a conferir". */
export function corteDaConferencia(hoje: Date, dias = CONFERIR_A_CADA_DIAS): Date {
  return new Date(hoje.getTime() - dias * 86_400_000);
}

/**
 * O `where` de cada recorte: as regras de `abaixoDoMinimo` e `precisaConferir`
 * escritas para o banco. O "a repor" compara duas colunas da mesma linha, por
 * isso recebe `minimo`, a referência à coluna (`inventoryItem.fields.minQuantity`).
 */
export function whereDoRecorte(
  recorte: RecorteDoEstoque,
  hoje: Date,
  minimo: Prisma.IntFieldRefInput<"InventoryItem">
): Prisma.InventoryItemWhereInput {
  switch (recorte) {
    case "todos":
      return ATIVOS;
    case "com-alguem":
      return { status: { in: ["EM_USO", "EMPRESTADO"] } };
    case "repor":
      return { ...ATIVOS, kind: "material", minQuantity: { not: null }, quantity: { lt: minimo } };
    case "conferir": {
      const corte = corteDaConferencia(hoje);
      return { ...ATIVOS, OR: [{ lastCheckedAt: { lte: corte } }, { lastCheckedAt: null, createdAt: { lte: corte } }] };
    }
    case "baixados":
      return { status: "BAIXADO" };
  }
}

/**
 * A busca por nome, categoria, patrimônio, série, local ou pessoa. A tabela é
 * utf8mb4_unicode_ci, que já ignora acento e caixa — o `semAcento` que a tela
 * fazia em memória.
 */
export function whereDaBusca(termo: string): Prisma.InventoryItemWhereInput {
  const t = termo.trim().slice(0, 100);
  if (!t) return {};
  return {
    OR: [
      { name: { contains: t } },
      { category: { contains: t } },
      { assetTag: { contains: t } },
      { serialNumber: { contains: t } },
      { location: { contains: t } },
      { holderName: { contains: t } },
    ],
  };
}
