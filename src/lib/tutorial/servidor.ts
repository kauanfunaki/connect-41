// O tutorial do primeiro acesso de cada pessoa (13/10/2026): se ele abre
// sozinho e quais passos ela vê. A regra e o texto moram em `tutoriais.ts`;
// aqui, só o que vem do banco e da sessão.
//
// Duas perguntas separadas, de propósito. "Abre sozinho?" roda em todo
// carregamento do app — para administrador nem consulta o banco, e para os
// outros é uma leitura pela chave. "Quais passos?" custa mais (módulos, setores,
// agentes da Ceci) e só roda quando o tutorial vai mesmo aparecer: no primeiro
// acesso ou no "Ver o tutorial de novo" da ajuda.

import type { AuthContext } from "@/lib/auth/context";
import { isFullAccess } from "@/lib/auth/papeis";
import { setoresDoSeletor } from "@/lib/auth/activeSector";
import type { PortalAccessTokenPayload } from "@/lib/auth/types";
import { getPrisma } from "@/lib/prisma";
import { getEnabledModuleCodes, getSectorsWithEnabledModules } from "@/lib/modules";
import { telasBloqueadasDoPortal } from "@/lib/portal/telasBloqueadas";
import { getSectorMaps } from "@/lib/sectors";
import { telasDoGeralDaPessoa } from "@/lib/menuGeralDb";
import { getVapidPublicKey } from "@/lib/vapid";
import { agentesDoChat } from "@/lib/ia/chat/agentes";
import {
  VERSAO_DO_TUTORIAL,
  abreSozinho,
  pulaOTutorialSozinho,
  tutorialDaEquipe,
  tutorialDoPortal,
  type Tutorial,
} from "./tutoriais";
import { lerTutorialVisto } from "./vistos";

/** O nome do escritório, para a boas-vindas. Sem ele, a boas-vindas só não leva o nome. */
async function nomeDoEscritorio(tenantId: string): Promise<string | null> {
  try {
    const t = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    return t?.name ?? null;
  } catch (err) {
    console.error("[tutorial] nome do escritório", err);
    return null;
  }
}

// ─── Equipe ─────────────────────────────────────────────────────────────────

/** O tutorial da equipe abre sozinho para esta pessoa? */
export async function tutorialDaEquipeAbreSozinho(ctx: AuthContext): Promise<boolean> {
  if (!ctx.userId || !ctx.tenantId) return false;
  if (pulaOTutorialSozinho(ctx.role)) return false;
  const estado = await lerTutorialVisto({ subject: "USER", userId: ctx.userId }, "equipe");
  return abreSozinho(estado, VERSAO_DO_TUTORIAL.equipe);
}

/**
 * A Ceci entra no tutorial se atende o setor em que a pessoa está — ou, em
 * "Todos os setores", algum setor dela. A Ajuda do Connect, que não é de setor,
 * não conta: o passo fala da IA do setor. `agentesDoChat` já aplica o público
 * do chat (só coordenadores, por padrão), o agente ligado e o acesso ao setor.
 * Falha aqui só tira o passo.
 */
async function temCeci(ctx: AuthContext): Promise<boolean> {
  try {
    const agentes = await agentesDoChat(ctx);
    return agentes.some((a) => a.setor !== null && (ctx.activeSector === null || a.setor === ctx.activeSector));
  } catch (err) {
    console.error("[tutorial] agentes da Ceci", err);
    return false;
  }
}

/** Os setores que o seletor do topo oferece — a mesma conta do layout do app. */
async function setoresNoMenu(ctx: AuthContext): Promise<number> {
  try {
    const [{ options }, comModulos] = await Promise.all([getSectorMaps(ctx.tenantId), getSectorsWithEnabledModules(ctx.tenantId)]);
    return setoresDoSeletor({
      userSectors: ctx.sectors,
      isFullAccess: isFullAccess(ctx.role),
      visitante: ctx.tenantId !== ctx.homeTenantId,
      setoresDoEscritorio: options.map((o) => o.value),
    }).filter((s) => comModulos.has(s)).length;
  } catch (err) {
    console.error("[tutorial] setores do menu", err);
    return ctx.sectors.length;
  }
}

/** Os passos do tutorial da equipe para esta pessoa. */
export async function montarTutorialDaEquipe(ctx: AuthContext): Promise<Tutorial> {
  const [escritorio, setores, ceci] = await Promise.all([nomeDoEscritorio(ctx.tenantId), setoresNoMenu(ctx), temCeci(ctx)]);
  return tutorialDaEquipe({
    role: ctx.role,
    escritorio,
    setoresNoMenu: setores,
    ceci,
    avisosNoCelular: Boolean(getVapidPublicKey()),
    // O mesmo menu Geral do layout; a leitura nunca lança (sem a tabela, todas).
    telasDoGeral: await telasDoGeralDaPessoa(ctx),
  });
}

// ─── Portal ─────────────────────────────────────────────────────────────────

/** O tutorial do portal abre sozinho para este cliente? */
export async function tutorialDoPortalAbreSozinho(sessao: PortalAccessTokenPayload): Promise<boolean> {
  if (!sessao.sub || !sessao.tenantId) return false;
  const estado = await lerTutorialVisto({ subject: "PORTAL_USER", userId: sessao.sub }, "portal");
  return abreSozinho(estado, VERSAO_DO_TUTORIAL.portal);
}

/**
 * Os passos do tutorial do portal: os módulos ligados no escritório e as telas
 * que ele já liberou (14/10/2026) decidem, como no menu. A leitura das
 * bloqueadas nunca lança — sem ela, nada bloqueado.
 */
export async function montarTutorialDoPortal(sessao: PortalAccessTokenPayload): Promise<Tutorial> {
  const [escritorio, modulos, bloqueadas] = await Promise.all([
    nomeDoEscritorio(sessao.tenantId),
    getEnabledModuleCodes(sessao.tenantId).catch((err) => {
      console.error("[tutorial] módulos do portal", err);
      return new Set<string>();
    }),
    telasBloqueadasDoPortal(sessao.tenantId),
  ]);
  return tutorialDoPortal({ escritorio, modulos, bloqueadas, avisosNoCelular: Boolean(getVapidPublicKey()) });
}
