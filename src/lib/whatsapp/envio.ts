// Mandar mensagem pela Cloud API.
//
// ─── A linha é gravada ANTES de sair ────────────────────────────────────────
//
// Mesma razão da `AgentRun`: se o processo morrer entre o `fetch` e o registro,
// sobra uma linha `PENDENTE` sem id da Meta — visível, e alguém confere. O
// contrário — gravar depois — produziria o único estado que não dá para
// consertar: **uma mensagem que o candidato recebeu e o Connect não sabe que
// enviou**. Na próxima passada o robô responderia de novo, e o candidato
// levaria duas.

import { getPrisma } from "@/lib/prisma";

const VERSAO_DA_API = "v21.0";

export type ResultadoDoEnvio =
  | { ok: true; waMessageId: string | null }
  | { ok: false; erro: string };

export type CredenciaisDoNumero = {
  phoneNumberId: string;
  accessToken: string;
};

/**
 * Manda um texto e devolve o id da Meta.
 *
 * Não lança: quem chama está no meio de um webhook, e uma exceção aqui viraria
 * 500 — que para a Meta significa "tente de novo", e reentrega gera segunda
 * resposta ao candidato.
 */
export async function enviarTexto(
  cred: CredenciaisDoNumero,
  paraE164: string,
  texto: string
): Promise<ResultadoDoEnvio> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${VERSAO_DA_API}/${cred.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cred.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: paraE164,
          type: "text",
          // `preview_url: false`: link em mensagem de recrutamento não precisa
          // de cartão, e o preview faz a Meta buscar a URL — uma requisição a
          // mais, saindo do nosso número, para um endereço que o modelo pode
          // ter tirado de um texto de terceiro.
          text: { body: texto, preview_url: false },
        }),
      }
    );

    const corpo = await res.text();
    if (!res.ok) {
      return { ok: false, erro: `Meta ${res.status}: ${corpo.slice(0, 400)}` };
    }

    let waMessageId: string | null = null;
    try {
      const json = JSON.parse(corpo) as { messages?: { id?: string }[] };
      waMessageId = json.messages?.[0]?.id ?? null;
    } catch {
      // Enviou e não deu para ler o id: é sucesso sem rastreio, e o `null`
      // registra isso em vez de fingir que falhou.
    }
    return { ok: true, waMessageId };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "falha de rede" };
  }
}

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
  cred: CredenciaisDoNumero;
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

  const r = await enviarTexto(params.cred, params.paraE164, params.texto);

  await prisma.whatsappMessage.update({
    where: { id: linha.id },
    data: r.ok
      ? { status: "ENVIADA", waMessageId: r.waMessageId, error: null }
      : { status: "FALHOU", error: r.erro.slice(0, 500) },
  });

  return r;
}

/** Registra que uma mensagem não saiu, e por quê. Sem tocar na Meta. */
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
