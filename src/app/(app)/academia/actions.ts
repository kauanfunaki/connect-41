"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import {
  comecarDesafio, comecarRodada, enviarAtalhos, enviarDigitacao, enviarLogica, gravarPreferencia, resumoDaAcademia, salvarPremio, salvarQuestao,
  salvarTexto,
} from "@/lib/academia/servidor";
import { gravarMeta, tirarMeta } from "@/lib/academia/metaServidor";
import { mandarParabens } from "@/lib/academia/hallServidor";
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

// ─── Fase 2 (11/11/2026) ─────────────────────────────────────────────────────

export async function comecarDesafioAction(): Promise<RodadaServida | { erro: string }> {
  return comecarDesafio(await quem());
}

export async function enviarAtalhosAction(envio: unknown): Promise<ResultadoDoEnvio> {
  const r = await enviarAtalhos(await quem(), envio);
  if (r.ok) revalidatePath("/academia", "layout");
  return r;
}

async function comAcademia<T>(fazer: (ctx: Awaited<ReturnType<typeof quem>>) => Promise<T>): Promise<T | { erro: string }> {
  const ctx = await quem();
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ACADEMIA))) return { erro: "A Academia não está disponível." };
  return fazer(ctx);
}

export async function gravarMetaAction(dados: unknown): Promise<{ ok: true } | { erro: string }> {
  const r = await comAcademia((ctx) => gravarMeta(ctx, dados));
  if ("ok" in r) revalidatePath("/academia", "layout");
  return r;
}

export async function tirarMetaAction(): Promise<{ ok: true } | { erro: string }> {
  const r = await comAcademia((ctx) => tirarMeta(ctx));
  if ("ok" in r) revalidatePath("/academia", "layout");
  return r;
}

export async function mandarParabensAction(dados: { paraUserId: string; mes: string; tipo: string }): Promise<{ ok: true } | { erro: string }> {
  const r = await comAcademia((ctx) => mandarParabens(ctx, dados));
  if ("ok" in r) revalidatePath("/academia", "layout");
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
