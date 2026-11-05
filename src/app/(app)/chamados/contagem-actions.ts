"use server";

import { getAuthContext } from "@/lib/auth/context";
import { configDoHelpdesk } from "@/lib/chamados/contexto";
import { contarChamadosDoMenu } from "@/lib/chamados/consultas";

/**
 * O número do item Chamados no menu, conferido a cada minuto pelo menu
 * (`useNumeroConferido`, como o das Solicitações). Falha devolve zero: o
 * número some, o menu não quebra.
 */
export async function contarChamadosDoMenuAction(): Promise<number> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.tenantId || !ctx.userId) return 0;
    return await contarChamadosDoMenu({ ctx, config: await configDoHelpdesk(ctx.tenantId) });
  } catch (err) {
    console.error("[menu] chamados", err);
    return 0;
  }
}
