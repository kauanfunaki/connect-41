"use server";

// A ação da Calculadora da reforma no portal (19/11/2026, funcionalidade-794):
// a mesma pergunta da tela da equipe, com o acesso do cliente — o módulo
// ligado no escritório e a tela liberada em Administração › Portal do cliente
// › Telas liberadas. Nada é gravado.

import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { MODULO_DA_CALCULADORA, type RetornoDaCalculadora } from "@/lib/tributario/calculadora/regras";
import { responderPergunta } from "@/lib/tributario/calculadora/calculadoraServidor";

export async function consultarCalculadoraDoPortal(pergunta: unknown): Promise<RetornoDaCalculadora<unknown>> {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return { ok: false, mensagem: "Sua sessão expirou. Entre de novo." };
  if (!cliente.modulos.has(MODULO_DA_CALCULADORA) || (await telaBloqueadaNoPortal(cliente.tenantId, "/portal/calculadora-tributaria"))) {
    return { ok: false, mensagem: "A calculadora não está disponível no seu portal." };
  }
  return responderPergunta(pergunta, "portal");
}
