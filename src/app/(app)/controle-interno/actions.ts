"use server";

import { revalidatePath } from "next/cache";
import { salvarItem, comentarItem, mudarSituacaoItem } from "@/lib/tech-interno/servidor";
import { ROTA_TECH_INTERNO } from "@/lib/tech-interno/regras";

export async function salvarItemTech(id: string | undefined, form: FormData) {
  const result = await salvarItem(Object.fromEntries(form), id, form.get("version"));
  if ("ok" in result) { revalidatePath(ROTA_TECH_INTERNO); revalidatePath(`${ROTA_TECH_INTERNO}/${result.id}`); }
  return result;
}
export async function comentarItemTech(id: string, form: FormData) {
  const result = await comentarItem(id, form.get("body"));
  if ("ok" in result) revalidatePath(`${ROTA_TECH_INTERNO}/${id}`);
  return result;
}
export async function mudarSituacaoTech(id: string, status: string, version: number) {
  const result = await mudarSituacaoItem(id, status, version);
  if ("ok" in result) { revalidatePath(ROTA_TECH_INTERNO); revalidatePath(`${ROTA_TECH_INTERNO}/${id}`); }
  return result;
}
