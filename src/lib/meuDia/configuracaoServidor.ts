// A leitura do Meu dia de cada pessoa (28/10/2026) — ver `configuracao.ts`.
//
// Nunca derruba a tela: sem a tabela (deploy antes da migration) ou com o banco
// recusando, ninguém tem configuração própria, e vale a do setor — o Meu dia de
// antes.

import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";

/** Os blocos gravados de cada pessoa, pelo id; quem não está no mapa segue o setor. */
export async function meuDiaDasPessoas(tenantId: string, userIds: string[]): Promise<Map<string, string>> {
  if (!tenantId || userIds.length === 0) return new Map();
  try {
    const linhas = await getPrisma().userTaskView.findMany({
      where: { tenantId, userId: { in: userIds } },
      select: { userId: true, widgets: true },
    });
    return new Map(linhas.map((l) => [l.userId, l.widgets]));
  } catch (err) {
    if (!isPrismaMissingTableError(err)) console.error("[meuDiaDasPessoas]", err);
    return new Map();
  }
}
