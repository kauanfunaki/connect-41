"use server";

import { contexto } from "@/lib/chamados/contexto";
import { situacaoDoChamado } from "@/lib/chamados/consultas";

/**
 * A situação do chamado, para a tela conferir se a triagem terminou
 * (`AtualizacaoDaTriagem`). Sem revalidar nada: é só leitura, chamada a cada
 * poucos segundos enquanto o chamado está em "Aguardando triagem". Falha
 * devolve nulo, e a tela tenta de novo na volta seguinte.
 */
export async function situacaoDaTriagem(id: string): Promise<{ status: string; version: number } | null> {
  try { return await situacaoDoChamado(await contexto(), id); }
  catch { return null; }
}
