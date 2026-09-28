// Quem enxerga cada vaga.
//
// A vaga é do setor que contrata (Societário, Tech…), e até 28/09/2026 só esse
// setor a via — quem era só do Recrutamento abria /vagas e achava "nenhuma
// vaga" (confirmado na bateria do chat de IA, teste R8). Decisão do Kauan em
// 28/09: **por padrão, todo recrutador vê todas as vagas**; o coordenador do
// Recrutamento pode restringir uma vaga (`Vaga.restrictedToRecruiters`) e dizer
// quais recrutadores continuam vendo (`VagaRecrutador`). Lista vazia esconde de
// todos os recrutadores.
//
// A restrição só mexe no caminho do Recrutamento. Quem é do setor dono da vaga,
// o coordenador do Recrutamento e o admin continuam vendo como antes.
//
// Duas perguntas, dois usos:
// - `regraDoRecrutador` é PERMISSÃO — não olha o setor ativo, como
//   canActOnSector. Serve para autorizar ação numa vaga.
// - `scopedVagaWhere` (src/lib/auth/scope.ts) é ESCOPO DE LEITURA — respeita o
//   setor ativo. Em "Todos os setores" ou no Recrutamento, soma o caminho do
//   recrutador; noutro setor ativo, mostra só as vagas daquele setor.

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { canActOnSector, isFullAccess, type AuthContext } from "@/lib/auth/context";

export const SETOR_RECRUTAMENTO = "recrutamento";

/**
 * O que o caminho do Recrutamento acrescenta às vagas que a pessoa vê.
 *
 * - `null`: a pessoa não é do Recrutamento (ou é admin, que já vê tudo) — nada
 *   a acrescentar.
 * - `"todas"`: coordenador do Recrutamento — vê toda vaga do tenant, inclusive
 *   as restritas, porque é quem decide a restrição.
 * - um `where`: recrutador — vagas sem restrição, mais as restritas em que foi
 *   escolhido.
 */
export function regraDoRecrutador(
  ctx: Pick<AuthContext, "role" | "sectors" | "userId">
): null | "todas" | Prisma.VagaWhereInput {
  if (isFullAccess(ctx.role)) return null;
  if (!ctx.sectors.includes(SETOR_RECRUTAMENTO)) return null;
  if (ehCoordenadorDoRecrutamento(ctx)) return "todas";
  return {
    OR: [{ restrictedToRecruiters: false }, { recrutadoresPermitidos: { some: { userId: ctx.userId } } }],
  };
}

/**
 * Coordenador do Recrutamento: quem pode restringir vagas. É VISÃO, então não
 * olha a assinatura — em somente leitura ele continua vendo tudo; quem barra a
 * escrita são as actions, com canManageSector.
 */
export function ehCoordenadorDoRecrutamento(ctx: Pick<AuthContext, "role" | "sectors">): boolean {
  if (ctx.role === "SUPER_ADMIN" || ctx.role === "ADMIN") return true;
  return ctx.role === "SECTOR_ADMIN" && ctx.sectors.includes(SETOR_RECRUTAMENTO);
}

/**
 * O `where` de leitura das vagas, a partir dos setores do recorte (já com o
 * setor ativo aplicado) e da regra do recrutador.
 *
 * `codigos === null` é full access em "Todos os setores": o tenant inteiro.
 */
export function ondeAsVagasVisiveis(
  tenantId: string,
  codigos: string[] | null,
  regra: null | "todas" | Prisma.VagaWhereInput
): Prisma.VagaWhereInput {
  if (codigos === null) return { tenantId };
  const pelaRegra = regra !== null && codigos.includes(SETOR_RECRUTAMENTO);
  if (!pelaRegra) {
    if (codigos.length === 0) return { tenantId, sectorCode: "__none__" };
    return { tenantId, sectorCode: { in: codigos } };
  }
  if (regra === "todas") return { tenantId };
  // O Recrutamento sai da lista de setores de propósito: vaga do próprio
  // Recrutamento também obedece à restrição, pelo caminho da regra.
  const outros = codigos.filter((c) => c !== SETOR_RECRUTAMENTO);
  const caminhos: Prisma.VagaWhereInput[] = [];
  if (outros.length > 0) caminhos.push({ sectorCode: { in: outros } });
  caminhos.push(...((regra.OR as Prisma.VagaWhereInput[]) ?? [regra]));
  return { tenantId, OR: caminhos };
}

/**
 * Pode agir (mover candidato, pontuar, usar o assistente) numa vaga que já
 * veio do banco. Quem é do setor dono age como antes; o recrutador age em toda
 * vaga que a regra dele deixa ver — por isso a checagem vai ao banco quando a
 * vaga é restrita.
 */
export async function podeAgirNaVaga(
  ctx: AuthContext,
  vaga: { id: string; sectorCode: string; restrictedToRecruiters?: boolean }
): Promise<boolean> {
  if (canActOnSector(ctx, vaga.sectorCode)) return true;
  if (!canActOnSector(ctx, SETOR_RECRUTAMENTO)) return false;
  const regra = regraDoRecrutador(ctx);
  if (regra === null) return false;
  if (regra === "todas") return true;
  if (vaga.restrictedToRecruiters === false) return true;
  const n = await getPrisma().vaga.count({ where: { id: vaga.id, tenantId: ctx.tenantId, ...regra } });
  return n > 0;
}

/**
 * A regra do recrutador em texto, para viajar no recorte da conversa do chat
 * de IA (`escopo.recrutador`), que só aceita string. Quem abre a conversa
 * calcula; a ferramenta da IA reconstrói com `regraPeloAcesso`.
 */
export function acessoDoRecrutador(ctx: Pick<AuthContext, "role" | "sectors" | "userId">): "" | "todas" | "restrito" {
  const regra = regraDoRecrutador(ctx);
  if (regra === null) return "";
  return regra === "todas" ? "todas" : "restrito";
}

export function regraPeloAcesso(
  acesso: string | undefined,
  userId: string | null
): null | "todas" | Prisma.VagaWhereInput {
  if (acesso === "todas") return "todas";
  if (acesso === "restrito" && userId) {
    return { OR: [{ restrictedToRecruiters: false }, { recrutadoresPermitidos: { some: { userId } } }] };
  }
  return null;
}
