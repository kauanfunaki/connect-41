"use server";

import { contextoDaTela } from "@/lib/atendimento/contexto";
import { contarParaMenu, marcaDaCaixa } from "@/lib/atendimento/consultas";

/**
 * O número do item Atendimento no menu, conferido a cada minuto
 * (`useNumeroConferido`). Falha devolve zero: o número some, o menu não quebra.
 */
export async function contarAtendimentoDoMenuAction(): Promise<number> {
  try {
    const c = await contextoDaTela();
    return c ? await contarParaMenu(c) : 0;
  } catch (err) {
    console.error("[menu] atendimento", err);
    return 0;
  }
}

/**
 * A marca do que mudou na caixa, conferida a cada poucos segundos pela tela
 * aberta (`CaixaDoAtendimento`). Falha devolve nulo: a tela segue com a
 * atualização de 30 s.
 */
export async function marcaDoAtendimentoAction(): Promise<string | null> {
  try {
    const c = await contextoDaTela();
    return c ? await marcaDaCaixa(c.ctx.tenantId) : null;
  } catch (err) {
    console.error("[atendimento] marca da caixa", err);
    return null;
  }
}
