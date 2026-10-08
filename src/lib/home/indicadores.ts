// O número que pede ação nos Indicadores da Home (escolha do Kauan na página
// de decisões, 08/10/2026 — 7A): no lugar de "Pessoas cadastradas", as
// solicitações dos clientes com a resposta atrasada.
//
// Por que este, entre os que saem barato:
// - é literalmente "aguardando a equipe": o cliente abriu pelo portal, a 41
//   prometeu responder até o dia X e o dia passou sem a primeira resposta;
// - não repete nada da Home — as tarefas atrasadas já estão no cartão ao lado,
//   na faixa e no painel; a solicitação não aparecia em lugar nenhum;
// - faz sentido para quem vê um setor só: a contagem é a da fila da pessoa
//   (os setores dela e o que está com ela), e com setor ativo, só a dele;
// - é uma contagem com o índice `(tenantId, status, sectorCode)`, sem lista.
// Descartados: "tarefas sem responsável" (o /tarefas conta outro conjunto de
// itens, e o cartão não teria para onde levar) e "transferências a revisar"
// (o cartão de Transferências já está ao lado).
//
// A regra e o recorte da equipe são os do cartão "Resposta atrasada" de
// /solicitacoes, importados de `lib/solicitacoes/consultas.ts` — se a fila
// mudar a regra, a Home acompanha.

import { unstable_rethrow } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { setoresDaFila } from "@/lib/solicitacoes/acesso";
import { whereDaEquipe, whereDaRespostaAtrasada } from "@/lib/solicitacoes/consultas";

export type EscopoDaContagem = {
  tenantId: string;
  /** Os setores da fila da pessoa; `null` = todos (administrador e leitura total). */
  setores: string[] | null;
  userId: string;
  /** O setor ativo da topbar, quando há — a Home dele conta só as dele. */
  setor: string | null;
};

/** O `where` de "Resposta atrasada" da fila da equipe, para este escopo. */
export function whereDasRespostasAtrasadas(e: EscopoDaContagem, agora: Date): Prisma.ServiceRequestWhereInput {
  return { AND: [whereDaEquipe(e), e.setor ? { sectorCode: e.setor } : {}, whereDaRespostaAtrasada(agora)] };
}

/** Para onde o cartão leva: a fila já no recorte "só com resposta atrasada" (e no setor ativo). */
export function linkDasRespostasAtrasadas(setor: string | null): string {
  return setor ? `/solicitacoes?setor=${encodeURIComponent(setor)}&atrasadas=1` : "/solicitacoes?atrasadas=1";
}

/**
 * A contagem do cartão, ou `null` quando ele não deve aparecer: o canal de
 * solicitações do portal desligado no escritório (a fila dá 404) ou a
 * consulta falhou — um número secundário não derruba a Home; o erro vai ao log.
 */
export async function solicitacoesComRespostaAtrasada(
  ctx: AuthContext,
  agora: Date
): Promise<{ quantas: number; href: string } | null> {
  if (!ctx.tenantId) return null;
  try {
    if (!(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) return null;
    const escopo: EscopoDaContagem = {
      tenantId: ctx.tenantId,
      setores: setoresDaFila(ctx),
      userId: ctx.userId,
      setor: ctx.activeSector,
    };
    const quantas = await getPrisma().serviceRequest.count({ where: whereDasRespostasAtrasadas(escopo, agora) });
    return { quantas, href: linkDasRespostasAtrasadas(ctx.activeSector) };
  } catch (err) {
    unstable_rethrow(err);
    console.error("[home] solicitações atrasadas indisponíveis", err);
    return null;
  }
}
