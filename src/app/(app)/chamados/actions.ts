"use server";

import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/chamados/contexto";
import { criarRascunho, salvarRascunho, avaliarRascunho, finalizarRascunho, alterar, comentar } from "@/lib/chamados/comandos";
import { salvarCategoria, salvarPolitica, configurarSetores } from "@/lib/chamados/configuracao";
import { removerAnexoRascunho } from "@/lib/chamados/anexos";
import { salvarFallback } from "@/lib/chamados/ia-fallback";

async function executar<T>(fn: () => Promise<T>) {
  try { const valor = await fn(); revalidatePath("/chamados", "layout"); return { ok: true as const, valor }; }
  catch (err) { return { ok: false as const, error: err instanceof Error ? err.message : "Não foi possível concluir. Tente novamente." }; }
}
export async function iniciar() { return executar(async () => criarRascunho(await contexto())); }
export async function guardar(id: string, version: number, input: unknown) { return executar(async () => salvarRascunho(await contexto(), id, version, input)); }
export async function avaliar(id: string, version: number, resposta?: string) { return executar(async () => avaliarRascunho(await contexto(), id, version, resposta)); }
export async function finalizar(id: string, version: number) { return executar(async () => finalizarRascunho(await contexto(), id, version, true)); }
export async function mudar(id: string, version: number, operacao: string, valor: unknown) { return executar(async () => alterar(await contexto(), id, version, operacao, valor)); }
export async function responder(id: string, version: number, input: unknown) { return executar(async () => comentar(await contexto(), id, version, input)); }
export async function categoria(input: unknown) { return executar(async () => salvarCategoria(await contexto(), input)); }
export async function politica(input: unknown) { return executar(async () => salvarPolitica(await contexto(), input)); }
export async function setores(input: unknown) { return executar(async () => { await configurarSetores(input); revalidatePath("/", "layout"); }); }
export async function retirarAnexo(draftId: string, id: string, version: number) { return executar(async () => removerAnexoRascunho(await contexto(), draftId, id, version)); }
export async function fallbackIa(input: unknown) { return executar(async () => salvarFallback(await contexto(), input)); }
