// A porta comum das Server Actions do modo real (22/10/2026). Não é
// "use server": são funções internas, chamadas pelas ações de
// `src/app/(app)/fiscal/*-actions.ts`.

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo, type NivelNoModulo } from "@/lib/auth/modulo";
import { ErroDoMotor, FORMATO_DA_CHAVE, type AtorDoMotor } from "@/lib/sped/motor";
import { abrirMotor, atorDaSessao, estabelecimentosDaRaiz, type MotorDoEscritorio } from "./servidor";

export type ResultadoDoMotor<T = undefined> =
  | { ok: true; mensagem: string; dados?: T }
  | {
      ok: false;
      mensagem: string;
      codigo?: string | null;
      campos?: Record<string, string>;
      /** O corpo do 409: `existente` na duplicata, `validacao_id`... */
      detalhe?: Record<string, unknown>;
      /** `false`: falha de rede ou 5xx — repetir com a MESMA chave. */
      renovarChave: boolean;
    };

export const raizSchema = z.string().regex(/^\d{8}$/);
export const idSchema = z.number().int().positive();
export const chaveSchema = z.string().regex(FORMATO_DA_CHAVE);

export const recusa = (mensagem: string, extra: Partial<Extract<ResultadoDoMotor, { ok: false }>> = {}): Extract<ResultadoDoMotor, { ok: false }> =>
  ({ ok: false, mensagem, renovarChave: true, ...extra });

export function doErro(err: unknown): Extract<ResultadoDoMotor, { ok: false }> {
  if (err instanceof ErroDoMotor) {
    const resto = err.corpo;
    return {
      ok: false,
      mensagem: err.message,
      codigo: err.codigo,
      ...(err.campos ? { campos: err.campos } : {}),
      detalhe: Object.fromEntries(Object.entries(resto).filter(([k]) => k !== "erro" && k !== "codigo" && k !== "campos")),
      // 4xx e recusa local: a próxima ação usa outra chave. Rede e 5xx: a mesma.
      renovarChave: err.definitivo || (err.status === 0 && err.codigo !== "falha_de_rede" && err.codigo !== "tempo_esgotado"),
    };
  }
  console.error("[fiscal/motor]", err);
  return { ok: false, mensagem: "Falha inesperada ao falar com o motor SPED.", renovarChave: false };
}

export type Preparo = { ctx: AuthContext; motor: MotorDoEscritorio; ator: AtorDoMotor };

/** A porta comum das escritas. Devolve o preparo ou a recusa, sem chamar o motor. */
export async function prepararEscrita(raiz: string, modulo: string, nivel: NivelNoModulo): Promise<Preparo | Extract<ResultadoDoMotor, { ok: false }>> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return recusa("Não autenticado.");
  if (!(await podeNoModulo(ctx, modulo, nivel))) return recusa("Seu perfil não permite esta ação.");
  const motor = await abrirMotor(ctx.tenantId);
  if (!motor) return recusa("A integração com o motor SPED não está configurada.");
  // 404 e não 403: raiz de fora não confirma que existe.
  if (!motor.raizes.includes(raiz)) return recusa("Empresa não encontrada.");
  if (!motor.escrita) return recusa("Escrita do SPED não habilitada: falta o token de escrita na integração.", { codigo: "escrita_nao_habilitada" });
  const ator = await atorDaSessao(ctx);
  if (!ator) return recusa("Não foi possível identificar o usuário para o motor SPED.");
  return { ctx, motor, ator };
}

export const recusado = (p: Preparo | Extract<ResultadoDoMotor, { ok: false }>): p is Extract<ResultadoDoMotor, { ok: false }> => "ok" in p;

export async function visiveis(ctx: AuthContext, raiz: string) {
  return (await estabelecimentosDaRaiz(ctx.tenantId, raiz)).visiveis;
}

export function revalidarFiscal() {
  revalidatePath("/fiscal", "layout");
}
