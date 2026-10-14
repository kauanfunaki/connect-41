"use server";

import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { VERSAO_DO_TUTORIAL } from "@/lib/tutorial/tutoriais";
import { marcarTutorialVisto } from "@/lib/tutorial/vistos";

/**
 * Marca o tutorial do portal como visto pelo cliente logado (13/10/2026) —
 * quando ele termina ou pula, no primeiro acesso ou ao rever pela ajuda.
 *
 * Não recebe nada de fora: o acesso e o escritório vêm da sessão do portal,
 * conferida ativa no banco (`sessaoAtivaDoPortal`). A sessão da equipe não
 * serve aqui — o cookie e o token são outros.
 */
export async function concluirTutorialDoPortal(): Promise<{ ok: boolean }> {
  const sessao = await sessaoAtivaDoPortal();
  if (!sessao) return { ok: false };
  const ok = await marcarTutorialVisto(
    { subject: "PORTAL_USER", userId: sessao.sub, tenantId: sessao.tenantId },
    "portal",
    VERSAO_DO_TUTORIAL.portal
  );
  return { ok };
}
