"use server";

import { getAuthContext } from "@/lib/auth/context";
import { VERSAO_DO_TUTORIAL } from "@/lib/tutorial/tutoriais";
import { marcarTutorialVisto } from "@/lib/tutorial/vistos";

/**
 * Marca o tutorial da equipe como visto por quem está logado (13/10/2026) —
 * chamado quando a pessoa termina ou pula, no primeiro acesso ou ao rever pela
 * ajuda.
 *
 * Não recebe nada de fora: quem e de qual escritório vêm da sessão da equipe
 * (os cabeçalhos que só o proxy grava). Uma chamada com a sessão do portal
 * chega sem eles e não grava nada. O escritório gravado é o de origem da
 * pessoa — o Super Admin de visita em outro continua sendo de lá.
 */
export async function concluirTutorialDaEquipe(): Promise<{ ok: boolean }> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { ok: false };
  const ok = await marcarTutorialVisto(
    { subject: "USER", userId: ctx.userId, tenantId: ctx.homeTenantId || ctx.tenantId },
    "equipe",
    VERSAO_DO_TUTORIAL.equipe
  );
  return { ok };
}
