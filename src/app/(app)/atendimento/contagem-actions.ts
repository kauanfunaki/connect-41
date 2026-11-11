"use server";

import { contextoDaTela } from "@/lib/atendimento/contexto";
import { contarParaMenu } from "@/lib/atendimento/consultas";

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
