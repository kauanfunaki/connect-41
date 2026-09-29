// O que as três telas da Gestão carregam em comum: nomes das pessoas e, por
// setor, quem pode receber um item (para o "trocar responsável").

import { getPrisma } from "@/lib/prisma";
import { getSectorUsers } from "@/lib/sectorUsers";
import { canManageSector, isFullWrite, type AuthContext } from "@/lib/auth/context";
import type { ItemClassificado } from "@/lib/gestao/itens";

export async function nomesDasPessoas(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const us = await getPrisma().user.findMany({ where: { tenantId, id: { in: unicos } }, select: { id: true, name: true } });
  return new Map(us.map((u) => [u.id, u.name]));
}

/**
 * Para cada setor em que quem vê pode trocar responsável, as pessoas do setor.
 * Setor que ele não coordena fica de fora — a linha mostra só o nome.
 */
export async function pessoasPorSetor(ctx: AuthContext, itens: ItemClassificado[]): Promise<Map<string, { id: string; name: string }[]>> {
  const setores = [...new Set(itens.filter((x) => x.item.origem === "PROCESSO" || x.item.origem === "CARD").map((x) => x.item.setor))];
  const mapa = new Map<string, { id: string; name: string }[]>();
  for (const s of setores) {
    if (isFullWrite(ctx.role) || canManageSector(ctx, s)) mapa.set(s, await getSectorUsers(ctx.tenantId, s));
  }
  return mapa;
}

/** Início do mês corrente em São Paulo, como instante. */
export function inicioDoMes(agora: Date): Date {
  const sp = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), 1, 3));
}
