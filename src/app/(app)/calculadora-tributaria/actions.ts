"use server";

// A ação da Calculadora da reforma (19/11/2026, funcionalidade-794): a tela
// pergunta (classificações da data, municípios da UF, alíquotas de referência,
// descrição do NCM/NBS, o cálculo) e a ação confere o módulo antes de
// repassar à calculadora. Nada é gravado: calcular é consultar, então basta
// ver o módulo — quem é Somente leitura também confere uma operação.

import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_DA_CALCULADORA, type RetornoDaCalculadora } from "@/lib/tributario/calculadora/regras";
import { responderPergunta } from "@/lib/tributario/calculadora/calculadoraServidor";

export async function consultarCalculadoraDaEquipe(pergunta: unknown): Promise<RetornoDaCalculadora<unknown>> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, mensagem: "Sessão expirada. Entre de novo." };
  if (!(await podeNoModulo(ctx, MODULO_DA_CALCULADORA, "ver"))) return { ok: false, mensagem: "Você não tem acesso à Calculadora da reforma." };
  return responderPergunta(pergunta);
}
