"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/chamados/contexto";
import { criarRascunho, salvarRascunho, enviarRascunho, excluirRascunho, alterar, comentar } from "@/lib/chamados/comandos";
import { triarChamado } from "@/lib/chamados/triagem-servidor";
import { motivoDaFalha } from "@/lib/chamados/falhaDaIa";
import { salvarPolitica } from "@/lib/chamados/configuracao";
import { removerAnexoRascunho } from "@/lib/chamados/anexos";

async function executar<T>(fn: () => Promise<T>) {
  try { const valor = await fn(); revalidatePath("/chamados", "layout"); return { ok: true as const, valor }; }
  catch (err) { return { ok: false as const, error: err instanceof Error ? err.message : "Não foi possível concluir. Tente novamente." }; }
}
export async function iniciar() { return executar(async () => criarRascunho(await contexto())); }
export async function guardar(id: string, version: number, input: unknown) { return executar(async () => salvarRascunho(await contexto(), id, version, input)); }
export async function descartar(id: string) { return executar(async () => excluirRascunho(await contexto(), id)); }
export async function mudar(id: string, version: number, operacao: string, valor: unknown) { return executar(async () => alterar(await contexto(), id, version, operacao, valor)); }
export async function responder(id: string, version: number, input: unknown) { return executar(async () => comentar(await contexto(), id, version, input)); }
export async function politica(input: unknown) { return executar(async () => salvarPolitica(await contexto(), input)); }
export async function retirarAnexo(draftId: string, id: string, version: number) { return executar(async () => removerAnexoRascunho(await contexto(), draftId, id, version)); }
/**
 * Abre o chamado na hora, em "Aguardando triagem" (10/11/2026), e agenda a
 * triagem para depois da resposta: quem abriu vai direto para a tela do
 * chamado. Um segundo envio do mesmo rascunho devolve o mesmo chamado, e a
 * triagem repetida não faz nada (`triarChamado` reserva a vez).
 */
export async function abrirChamado(id: string, version: number) {
  return executar(async () => {
    const c = await contexto();
    const { ticketId } = await enviarRascunho(c, id, version);
    const tenantId = c.ctx.tenantId;
    after(async () => {
      try { await triarChamado(tenantId, ticketId); }
      catch (err) { console.error(`[chamados] triagem do chamado ${ticketId} (escritório ${tenantId}) não terminou; o motor de alertas retoma: ${motivoDaFalha(err)}`); }
    });
    return { ticketId };
  });
}
