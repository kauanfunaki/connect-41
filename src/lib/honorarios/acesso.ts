// A porta das telas e das ações de "Contratos e honorários".
//
// Cada tela abre com `abrirTelaDoModulo("controladoria_honorarios")` e cada ação
// confere `podeNoModulo(ctx, "controladoria_honorarios", nível)` com o código
// escrito no próprio arquivo (é o que o teste do gate procura). Daqui saem só
// as peças comuns: os níveis e rodar as consultas dentro do escritório.
//
// Níveis (decisão de 11/11/2026, migracao-622):
// - ver: as quatro telas;
// - agir: vincular pasta, marcar "sem pasta", informar valor, pedir varredura;
// - gerir: enviar ao Acessórias e liberar a trava (fase 4).

import { podeNoModulo } from "@/lib/auth/modulo";
import type { AuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { noEscritorio } from "./servidor/contexto";

export const MODULO_HONORARIOS = "controladoria_honorarios";

/** O que a pessoa pode fazer na tela, para mostrar ou esconder os botões. */
export async function permissoesNosHonorarios(ctx: AuthContext) {
  const [podeAgir, podeGerir] = await Promise.all([
    podeNoModulo(ctx, MODULO_HONORARIOS, "agir"),
    podeNoModulo(ctx, MODULO_HONORARIOS, "gerir"),
  ]);
  return { podeAgir, podeGerir };
}

/** Roda as consultas da tela no escritório de quem abriu. */
export function noEscritorioDe<T>(ctx: AuthContext, fn: () => Promise<T>): Promise<T> {
  if (!ctx.tenantId) throw new Error("Honorários: sem escritório.");
  return noEscritorio(ctx.tenantId, fn);
}

export type ResultadoDaAcao = { ok: true; mensagem?: string } | { ok: false; erro: string };

/**
 * Roda a ação (já autorizada) no escritório. O erro com mensagem para a pessoa
 * (`AppError` das regras) volta como `erro`; o resto sobe.
 */
export async function rodarAcao(ctx: AuthContext, fazer: () => Promise<string | void>): Promise<ResultadoDaAcao> {
  try {
    const mensagem = await noEscritorioDe(ctx, fazer);
    return { ok: true, ...(mensagem ? { mensagem } : {}) };
  } catch (err) {
    if (err instanceof Error && err.name === "AppError") return { ok: false, erro: err.message };
    throw err;
  }
}

/** Nome de quem fez, como aparece no histórico ("informado por"). */
export async function nomeDeQuemFez(ctx: AuthContext): Promise<string> {
  const u = await getPrisma().user.findFirst({
    where: { id: ctx.userId, tenantId: ctx.tenantId },
    select: { name: true },
  });
  return u?.name ?? "Equipe";
}
