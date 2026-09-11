// O que acontece quando um candidato manda mensagem.
//
// A cola entre as peças puras (`payload`, `decisao`) e as impuras (banco,
// agente, Cloud API). Vive fora da rota porque a rota tem um trabalho só:
// autenticar e responder 200 rápido.
//
// ─── 200 rápido, sempre ─────────────────────────────────────────────────────
//
// A Meta reentrega quando não recebe 200 em poucos segundos. Como a resposta
// depende de uma conversa com o modelo — que leva segundos, às vezes mais —
// processar dentro do ciclo da requisição é pedir reentrega, e reentrega é
// segunda mensagem ao candidato. O `waMessageId` único é o que segura isso, e
// é a primeira coisa que este módulo faz.

import { getPrisma } from "@/lib/prisma";
import { conversarComAgente } from "@/lib/ai";
import { lerConfig } from "@/lib/integracoes/data";
import {
  decidir,
  decidirComARespostaDoAgente,
  montarMensagem,
  CONFIRMACAO_DE_SAIDA,
  type EstadoDaConversa,
} from "@/lib/whatsapp/decisao";
import { enviarERegistrar, registrarBloqueio } from "@/lib/whatsapp/envio";
import type { MensagemRecebida } from "@/lib/whatsapp/payload";

const AGENTE = "atendente_de_candidato";

const SISTEMA =
  "Você é o atendente virtual do Recrutamento da 41 Contábil, falando por WhatsApp com um " +
  "candidato. Escreva em português do Brasil, curto — no máximo três frases —, educado e " +
  "direto, como se estivesse no WhatsApp mesmo, sem formatação e sem listas longas.\n" +
  "Consulte as ferramentas antes de afirmar qualquer coisa sobre o processo da pessoa; nunca " +
  "invente etapa, prazo ou resultado.\n" +
  "VOCÊ NUNCA: reprova alguém, fala de salário, faz ou insinua proposta, confirma contratação, " +
  "promete prazo que não leu no sistema, nem pede CPF, RG, data de nascimento ou qualquer " +
  "documento.\n" +
  "Em qualquer um desses casos — e sempre que não tiver certeza — use a ferramenta " +
  "pedir_ajuda_humana. Não é derrota: é o certo a fazer.";

/** Grava a mensagem recebida. `false` quando já tínhamos visto este id. */
async function registrarEntrada(
  tenantId: string,
  threadId: string,
  m: MensagemRecebida
): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.whatsappMessage.create({
      data: {
        tenantId,
        threadId,
        direction: "ENTRADA",
        waMessageId: m.waMessageId,
        body: m.texto,
      },
    });
    return true;
  } catch {
    // Violação da chave única em `waMessageId` — reentrega da Meta. É o
    // caminho normal, não erro: a Meta reenvia sempre que não recebe 200
    // rápido, e é exatamente aqui que a segunda resposta ao candidato morre.
    return false;
  }
}

async function acharOuCriarThread(params: {
  tenantId: string;
  integrationId: string;
  waPhone: string;
}) {
  const prisma = getPrisma();
  const existente = await prisma.whatsappThread.findUnique({
    where: {
      integrationId_waPhone: { integrationId: params.integrationId, waPhone: params.waPhone },
    },
  });
  if (existente) return existente;
  return prisma.whatsappThread.create({
    data: {
      tenantId: params.tenantId,
      integrationId: params.integrationId,
      waPhone: params.waPhone,
    },
  });
}

async function transferir(threadId: string, motivo: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.whatsappThread.update({
    where: { id: threadId },
    data: { handoffAt: new Date(), handoffReason: motivo.slice(0, 300) },
  });
}

export type Conexao = {
  id: string;
  tenantId: string;
  enabled: boolean;
  configEnc: string;
};

/**
 * Trata uma mensagem recebida, do começo ao fim.
 *
 * Devolve o que aconteceu, para o log — a rota não usa, mas quem investigar
 * "por que este candidato não recebeu resposta" vai procurar exatamente isto.
 */
export async function atenderMensagem(
  conexao: Conexao,
  m: MensagemRecebida
): Promise<string> {
  const agora = new Date();
  const prisma = getPrisma();

  const thread = await acharOuCriarThread({
    tenantId: conexao.tenantId,
    integrationId: conexao.id,
    waPhone: m.de,
  });

  const novo = await registrarEntrada(conexao.tenantId, thread.id, m);
  if (!novo) return "reentrega ignorada";

  const [saidas, respostasNaUltimaHora] = await Promise.all([
    prisma.whatsappMessage.count({
      where: { threadId: thread.id, direction: "SAIDA", status: "ENVIADA" },
    }),
    prisma.whatsappMessage.count({
      where: {
        threadId: thread.id,
        direction: "SAIDA",
        agentRunId: { not: null },
        createdAt: { gte: new Date(agora.getTime() - 3_600_000) },
      },
    }),
  ]);

  const estado: EstadoDaConversa = {
    integracaoLigada: conexao.enabled,
    optedOutAt: thread.optedOutAt,
    handoffAt: thread.handoffAt,
    // A janela conta da mensagem ANTERIOR: esta ainda não foi carimbada.
    lastInboundAt: thread.lastInboundAt,
    respostasNaUltimaHora,
    jaSeApresentou: saidas > 0,
  };

  const decisao = decidir(estado, m.texto, agora);

  // Carimba o inbound depois de decidir, e sempre — inclusive quando ninguém
  // responde. É o relógio da janela de 24h, e ele não depende de termos falado.
  await prisma.whatsappThread.update({
    where: { id: thread.id },
    data: { lastInboundAt: m.recebidaEm },
  });

  if (decisao.tipo === "silenciar") return `silenciado: ${decisao.motivo}`;

  if (decisao.tipo === "transferir") {
    await transferir(thread.id, decisao.motivo);
    return `transferido: ${decisao.motivo}`;
  }

  const cred = credenciais(conexao);

  if (decisao.tipo === "confirmar_saida") {
    await prisma.whatsappThread.update({
      where: { id: thread.id },
      data: { optedOutAt: agora },
    });
    // A marca vem antes do envio: se o envio falhar, a pessoa fica sem a
    // confirmação, o que é chato. Na ordem inversa ela ficaria sem a marca, o
    // que é receber mensagem depois de ter pedido para parar.
    await enviarERegistrar({
      tenantId: conexao.tenantId,
      threadId: thread.id,
      cred,
      paraE164: m.de,
      texto: CONFIRMACAO_DE_SAIDA,
    });
    return "saída confirmada";
  }

  // ─── Responder ────────────────────────────────────────────────────────────
  let resposta;
  try {
    resposta = await conversarComAgente({
      tenantId: conexao.tenantId,
      agentCode: AGENTE,
      system: SISTEMA,
      pergunta: m.texto,
      maxTokens: 800,
      // `CRON` não: foi o candidato que provocou. `SISTEMA` é o que descreve
      // "efeito de algo que chegou de fora", e é o que separa este gasto do
      // que alguém da 41 pediu clicando.
      contexto: { trigger: "SISTEMA", entityType: "whatsapp", entityId: thread.id },
      escopo: { threadId: thread.id },
    });
  } catch (err) {
    // Teto atingido, agente desligado, provedor fora do ar: nenhum desses é
    // motivo para o candidato ficar sem resposta. Vai para uma pessoa.
    const motivo = err instanceof Error ? err.message : "falha ao consultar o assistente";
    console.error("[whatsapp] agente falhou", thread.id, err);
    await transferir(thread.id, motivo);
    return `transferido: ${motivo}`;
  }

  const desfecho = decidirComARespostaDoAgente({
    texto: resposta.valor,
    propostas: resposta.propostas.length,
    truncado: resposta.truncado,
  });

  if (desfecho.tipo === "transferir") {
    await transferir(thread.id, desfecho.motivo);
    // Guarda o que o robô teria dito, marcado como bloqueada: quem assumir a
    // conversa vê o rascunho, e a trilha não perde o que foi decidido não
    // mandar.
    await registrarBloqueio({
      tenantId: conexao.tenantId,
      threadId: thread.id,
      texto: resposta.valor,
      motivo: desfecho.motivo,
    });
    return `transferido: ${desfecho.motivo}`;
  }

  await enviarERegistrar({
    tenantId: conexao.tenantId,
    threadId: thread.id,
    cred,
    paraE164: m.de,
    texto: montarMensagem(desfecho.texto, decisao.apresentar),
    agentRunId: resposta.runId ?? null,
  });
  return "respondido";
}

function credenciais(conexao: Conexao) {
  const config = lerConfig(conexao.configEnc);
  return {
    phoneNumberId: config.phoneNumberId ?? "",
    accessToken: config.accessToken ?? "",
  };
}

/** Uma mensagem que não é texto: ninguém responde, e uma pessoa assume. */
export async function tratarNaoTexto(
  conexao: Conexao,
  de: string,
  tipo: string
): Promise<void> {
  const thread = await acharOuCriarThread({
    tenantId: conexao.tenantId,
    integrationId: conexao.id,
    waPhone: de,
  });
  if (thread.optedOutAt || thread.handoffAt) return;
  // Responder a um áudio com um robô que não o ouviu é pior que não responder.
  await transferir(thread.id, `candidato mandou ${tipo}, que o robô não lê`);
}
