"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import {
  comecarRodada, enviarDigitacao, enviarLogica, gravarPreferencia, resumoDaAcademia, salvarPremio, salvarQuestao, salvarTexto,
} from "@/lib/academia/servidor";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_ACADEMIA } from "@/lib/academia/regras";
import type { ResultadoDoEnvio, ResumoDaAcademia, RodadaServida } from "@/lib/academia/tipos";

// As ações da Academia (10/11/2026, pedido do Kauan). A regra e a conferência
// de quem pode moram em `src/lib/academia/servidor.ts`; aqui só se pega quem
// está pedindo e se refaz a tela que mudou.

async function quem() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) throw new Error("Entre novamente para continuar.");
  return ctx;
}

/** O painel do chapéu de formatura, buscado ao abrir (como o sino). */
export async function resumoDoPainelAction(): Promise<ResumoDaAcademia | null> {
  const ctx = await quem();
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ACADEMIA))) return null;
  return resumoDaAcademia(ctx);
}

export async function comecarRodadaAction(entrada: { teste: string; nivel: string; valendo: boolean }): Promise<RodadaServida | { erro: string }> {
  return comecarRodada(await quem(), entrada);
}

export async function enviarDigitacaoAction(envio: unknown): Promise<ResultadoDoEnvio> {
  const r = await enviarDigitacao(await quem(), envio);
  if (r.ok) revalidatePath("/academia", "layout");
  return r;
}

export async function enviarLogicaAction(envio: unknown): Promise<ResultadoDoEnvio> {
  const r = await enviarLogica(await quem(), envio);
  if (r.ok) revalidatePath("/academia", "layout");
  return r;
}

export async function gravarPreferenciaAction(aparecer: boolean): Promise<{ ok: true } | { erro: string }> {
  const r = await gravarPreferencia(await quem(), aparecer === true);
  if ("ok" in r) revalidatePath("/academia", "layout");
  return r;
}

export async function salvarTextoAction(dados: unknown): Promise<{ ok: true } | { erro: string }> {
  const r = await salvarTexto(await quem(), dados);
  if ("ok" in r) revalidatePath("/academia", "layout");
  return r;
}

export async function salvarQuestaoAction(dados: unknown): Promise<{ ok: true } | { erro: string }> {
  const r = await salvarQuestao(await quem(), dados);
  if ("ok" in r) revalidatePath("/academia", "layout");
  return r;
}

export async function salvarPremioAction(dados: unknown): Promise<{ ok: true } | { erro: string }> {
  const r = await salvarPremio(await quem(), dados);
  if ("ok" in r) revalidatePath("/academia", "layout");
  return r;
}
