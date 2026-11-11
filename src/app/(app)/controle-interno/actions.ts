"use server";

import { revalidatePath } from "next/cache";
import { salvarItem, comentarItem, mudarSituacaoItem, conferirCriterio, conferirEntrega } from "@/lib/tech-interno/servidor";
import type { ResultadoDaConferencia } from "@/lib/tech-interno/conferenciaDaEntrega";
import { ROTA_TECH_INTERNO } from "@/lib/tech-interno/regras";
import { removerAnexo } from "@/lib/tech-interno/anexos";
import { getAuthContext } from "@/lib/auth/context";

// As telas agem com a pessoa da sessão; a API e o MCP, com a dona do token
// pessoal — a mesma regra do servidor (05/11/2026). O que volta para a tela é
// só `ok`/`id` ou a mensagem de erro, como antes; o salvar devolve também o
// endereço curto do item (10/11/2026).
type Resposta = { ok: true; id: string } | { error: string };
// A tela do item em qualquer endereço (10/11/2026): o curto de agora, o de um
// tipo anterior e o antigo, com o uuid, que passam para ele. O padrão da rota
// leva o grupo `(app)`, como o arquivo da página.
const revalidarItens = () => revalidatePath(`/(app)${ROTA_TECH_INTERNO}/[id]`, "page");
/** Salva o item; `endereco` é o endereço curto de agora, para a tela ir até ele. */
export async function salvarItemTech(id: string | undefined, form: FormData): Promise<{ ok: true; id: string; endereco: string } | { error: string }> {
  const result = await salvarItem(await getAuthContext(), Object.fromEntries(form), id, form.get("version"));
  if ("ok" in result) { revalidatePath(ROTA_TECH_INTERNO); revalidarItens(); return { ok: true, id: result.id, endereco: result.endereco }; }
  return { error: result.error };
}
export async function comentarItemTech(id: string, form: FormData): Promise<Resposta> {
  const result = await comentarItem(await getAuthContext(), id, form.get("body"));
  if ("ok" in result) { revalidarItens(); return { ok: true, id }; }
  return { error: result.error };
}
export async function mudarSituacaoTech(id: string, status: string, version: number, entrega?: { prUrl?: string; commitSha?: string }): Promise<Resposta> {
  const result = await mudarSituacaoItem(await getAuthContext(), id, status, version, entrega);
  if ("ok" in result) { revalidatePath(ROTA_TECH_INTERNO); revalidarItens(); return { ok: true, id: result.id }; }
  return { error: result.error };
}
/** Marca ou desmarca um ponto do "Aprovado quando" (10/11/2026) ou do "Antes de testar" (11/11/2026). */
export async function conferirCriterioTech(id: string, posicao: number, texto: string, marcado: boolean, secao: "aprovado" | "antes" = "aprovado"): Promise<Resposta> {
  const result = await conferirCriterio(await getAuthContext(), id, posicao, texto, marcado, secao);
  if ("ok" in result) { revalidarItens(); return { ok: true, id }; }
  return { error: result.error };
}
/** O "Conferir" junto ao PR (11/11/2026): PR mergeado, migration aplicada e no ar. */
export async function conferirEntregaTech(id: string): Promise<{ ok: true; resumo: string; resultados: ResultadoDaConferencia[] } | { error: string }> {
  const result = await conferirEntrega(await getAuthContext(), id);
  if ("ok" in result) { revalidarItens(); return { ok: true, resumo: result.resumo, resultados: result.resultados }; }
  return { error: result.error };
}
export async function removerAnexoTech(id: string): Promise<{ error: string } | null> {
  const result = await removerAnexo(await getAuthContext(), id);
  if (!result.ok) return { error: result.erro };
  revalidarItens();
  return null;
}
