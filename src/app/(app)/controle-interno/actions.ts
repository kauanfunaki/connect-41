"use server";

import { revalidatePath } from "next/cache";
import { salvarItem, comentarItem, mudarSituacaoItem } from "@/lib/tech-interno/servidor";
import { ROTA_TECH_INTERNO } from "@/lib/tech-interno/regras";
import { removerAnexo } from "@/lib/tech-interno/anexos";
import { getAuthContext } from "@/lib/auth/context";

// As telas agem com a pessoa da sessão; a API e o MCP, com a dona do token
// pessoal — a mesma regra do servidor (05/11/2026). O que volta para a tela é
// só `ok`/`id` ou a mensagem de erro, como antes.
type Resposta = { ok: true; id: string } | { error: string };
export async function salvarItemTech(id: string | undefined, form: FormData): Promise<Resposta> {
  const result = await salvarItem(await getAuthContext(), Object.fromEntries(form), id, form.get("version"));
  if ("ok" in result) { revalidatePath(ROTA_TECH_INTERNO); revalidatePath(`${ROTA_TECH_INTERNO}/${result.id}`); return { ok: true, id: result.id }; }
  return { error: result.error };
}
export async function comentarItemTech(id: string, form: FormData): Promise<Resposta> {
  const result = await comentarItem(await getAuthContext(), id, form.get("body"));
  if ("ok" in result) { revalidatePath(`${ROTA_TECH_INTERNO}/${id}`); return { ok: true, id }; }
  return { error: result.error };
}
export async function mudarSituacaoTech(id: string, status: string, version: number): Promise<Resposta> {
  const result = await mudarSituacaoItem(await getAuthContext(), id, status, version);
  if ("ok" in result) { revalidatePath(ROTA_TECH_INTERNO); revalidatePath(`${ROTA_TECH_INTERNO}/${id}`); return { ok: true, id: result.id }; }
  return { error: result.error };
}
export async function removerAnexoTech(id: string): Promise<{ error: string } | null> {
  const result = await removerAnexo(await getAuthContext(), id);
  if (!result.ok) return { error: result.erro };
  revalidatePath(`${ROTA_TECH_INTERNO}/${result.valor.itemId}`);
  return null;
}
