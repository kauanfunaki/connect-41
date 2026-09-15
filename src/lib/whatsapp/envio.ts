// Mandar mensagem por WhatsApp, qualquer que seja o provedor.
//
// ─── A linha é gravada ANTES de sair ────────────────────────────────────────
//
// Mesma razão da `AgentRun`: se o processo morrer entre o envio e o registro,
// sobra uma linha `PENDENTE` sem id do provedor — visível, e alguém confere. O
// contrário — gravar depois — produziria o único estado que não dá para
// consertar: **uma mensagem que o candidato recebeu e o Connect não sabe que
// enviou**. Na próxima passada o robô responderia de novo, e o candidato
// levaria duas.
//
// O envio em si é do provedor (`provedores/`); aqui fica só o que é igual para
// todos.

import { getPrisma } from "@/lib/prisma";
import type { ConfigDoProvedor, ProvedorWhatsapp, ResultadoDoEnvio } from "./provedores/tipos";

export type { ResultadoDoEnvio } from "./provedores/tipos";

/**
 * Grava a linha, envia, e fecha a linha. **Caminho único de saída.**
 *
 * Toda mensagem que sai do Connect por WhatsApp passa por aqui — inclusive a
 * confirmação de opt-out e a que uma pessoa escrever pela tela. Ter dois
 * caminhos de envio é ter um que esquece de registrar.
 */
export async function enviarERegistrar(params: {
  tenantId: string;
  threadId: string;
  provedor: ProvedorWhatsapp;
  config: ConfigDoProvedor;
  paraE164: string;
  texto: string;
  agentRunId?: string | null;
}): Promise<ResultadoDoEnvio> {
  const prisma = getPrisma();
  const linha = await prisma.whatsappMessage.create({
    data: {
      tenantId: params.tenantId,
      threadId: params.threadId,
      direction: "SAIDA",
      body: params.texto,
      status: "PENDENTE",
      agentRunId: params.agentRunId ?? null,
    },
    select: { id: true },
  });

  const r = await params.provedor.enviarTexto(params.config, params.paraE164, params.texto);

  await prisma.whatsappMessage.update({
    where: { id: linha.id },
    data: r.ok
      ? { status: "ENVIADA", waMessageId: r.waMessageId, error: null }
      : { status: "FALHOU", error: r.erro.slice(0, 500) },
  });

  return r;
}

/** Registra que uma mensagem não saiu, e por quê. Sem tocar no provedor. */
export async function registrarBloqueio(params: {
  tenantId: string;
  threadId: string;
  texto: string;
  motivo: string;
}): Promise<void> {
  const prisma = getPrisma();
  await prisma.whatsappMessage.create({
    data: {
      tenantId: params.tenantId,
      threadId: params.threadId,
      direction: "SAIDA",
      body: params.texto,
      status: "BLOQUEADA",
      error: params.motivo.slice(0, 500),
    },
  });
}
