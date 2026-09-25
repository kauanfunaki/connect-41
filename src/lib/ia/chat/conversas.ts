// Leitura e gravação das conversas do chat de IA.
//
// Toda consulta leva `tenantId` **e** `userId` no `where`: a conversa é da
// pessoa, e id de conversa de outra pessoa responde "não encontrada", igual a
// um id que não existe.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { TurnoAnterior } from "@/lib/ia/laco";
import { corteDaRetencao, inicioDoDiaEmSaoPaulo, lerPropostas, tituloDaConversa, type PropostaGravada } from "./regras";

export type Dono = { tenantId: string; userId: string };

export type MensagemNaTela = {
  id: string;
  papel: "usuario" | "assistente";
  texto: string;
  propostas: PropostaGravada[];
  truncada: boolean;
  falhou: boolean;
  contexto: string | null;
  criadaEm: string;
};

export type ConversaNaLista = { id: string; titulo: string; agentCode: string; atualizadaEm: string };

/** Quantas mensagens de uma conversa a tela carrega. */
const LIMITE_NA_TELA = 200;

export async function perguntasDeHoje(dono: Dono, agora: Date): Promise<number> {
  return getPrisma().agentMessage.count({
    where: {
      role: "USUARIO",
      createdAt: { gte: inicioDoDiaEmSaoPaulo(agora) },
      conversation: { tenantId: dono.tenantId, userId: dono.userId },
    },
  });
}

/** Apaga as conversas do escritório paradas há mais de 90 dias. Barato: índice em `updatedAt`. */
export async function apagarConversasVencidas(tenantId: string, agora: Date): Promise<void> {
  try {
    await getPrisma().agentConversation.deleteMany({ where: { tenantId, updatedAt: { lt: corteDaRetencao(agora) } } });
  } catch (err) {
    console.error("[chat-ia] limpeza de conversas", err);
  }
}

/** A conversa da pessoa, ou uma nova com este agente. */
export async function conversaParaPerguntar(
  dono: Dono,
  conversaId: string | null,
  agentCode: string,
  pergunta: string
): Promise<{ id: string; agentCode: string } | null> {
  const prisma = getPrisma();
  if (conversaId) {
    return prisma.agentConversation.findFirst({
      where: { id: conversaId, tenantId: dono.tenantId, userId: dono.userId },
      select: { id: true, agentCode: true },
    });
  }
  return prisma.agentConversation.create({
    data: { tenantId: dono.tenantId, userId: dono.userId, agentCode, title: tituloDaConversa(pergunta) },
    select: { id: true, agentCode: true },
  });
}

/** As trocas anteriores, em texto, para mandar junto da pergunta. */
export async function historicoDaConversa(conversaId: string): Promise<TurnoAnterior[]> {
  const linhas = await getPrisma().agentMessage.findMany({
    where: { conversationId: conversaId, failed: false },
    select: { role: true, content: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return linhas.reverse().map((m) => ({ papel: m.role === "USUARIO" ? "usuario" : "assistente", texto: m.content }));
}

export async function gravarMensagem(input: {
  conversaId: string;
  papel: "usuario" | "assistente";
  texto: string;
  propostas?: PropostaGravada[];
  runId?: string | null;
  truncada?: boolean;
  falhou?: boolean;
  contexto?: string | null;
}): Promise<MensagemNaTela> {
  const prisma = getPrisma();
  const [m] = await prisma.$transaction([
    prisma.agentMessage.create({
      data: {
        conversationId: input.conversaId,
        role: input.papel === "usuario" ? "USUARIO" : "ASSISTENTE",
        content: input.texto,
        proposals: input.propostas && input.propostas.length > 0 ? (input.propostas as unknown as Prisma.InputJsonValue) : undefined,
        runId: input.runId ?? null,
        truncated: input.truncada ?? false,
        failed: input.falhou ?? false,
        contextLabel: input.contexto ?? null,
      },
    }),
    // Toca a conversa: é o `updatedAt` que ordena a lista e conta a retenção.
    prisma.agentConversation.update({ where: { id: input.conversaId }, data: { updatedAt: new Date() } }),
  ]);
  return paraTela(m);
}

function paraTela(m: {
  id: string;
  role: "USUARIO" | "ASSISTENTE";
  content: string;
  proposals: unknown;
  truncated: boolean;
  failed: boolean;
  contextLabel: string | null;
  createdAt: Date;
}): MensagemNaTela {
  return {
    id: m.id,
    papel: m.role === "USUARIO" ? "usuario" : "assistente",
    texto: m.content,
    propostas: lerPropostas(m.proposals),
    truncada: m.truncated,
    falhou: m.failed,
    contexto: m.contextLabel,
    criadaEm: m.createdAt.toISOString(),
  };
}

export async function listarConversas(dono: Dono): Promise<ConversaNaLista[]> {
  const linhas = await getPrisma().agentConversation.findMany({
    where: { tenantId: dono.tenantId, userId: dono.userId },
    select: { id: true, title: true, agentCode: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  return linhas.map((c) => ({ id: c.id, titulo: c.title, agentCode: c.agentCode, atualizadaEm: c.updatedAt.toISOString() }));
}

export async function mensagensDaConversa(
  dono: Dono,
  conversaId: string
): Promise<{ agentCode: string; mensagens: MensagemNaTela[] } | null> {
  const c = await getPrisma().agentConversation.findFirst({
    where: { id: conversaId, tenantId: dono.tenantId, userId: dono.userId },
    select: {
      agentCode: true,
      messages: { orderBy: { createdAt: "desc" }, take: LIMITE_NA_TELA },
    },
  });
  if (!c) return null;
  return { agentCode: c.agentCode, mensagens: c.messages.reverse().map(paraTela) };
}

export async function apagarConversa(dono: Dono, conversaId: string): Promise<boolean> {
  const r = await getPrisma().agentConversation.deleteMany({
    where: { id: conversaId, tenantId: dono.tenantId, userId: dono.userId },
  });
  return r.count > 0;
}

/** A mensagem do assistente com as propostas, se for da pessoa. */
export async function mensagemComPropostas(dono: Dono, mensagemId: string) {
  return getPrisma().agentMessage.findFirst({
    where: { id: mensagemId, role: "ASSISTENTE", conversation: { tenantId: dono.tenantId, userId: dono.userId } },
    select: { id: true, proposals: true, conversation: { select: { agentCode: true } } },
  });
}

export async function marcarPropostaAplicada(mensagemId: string, propostas: PropostaGravada[], indice: number): Promise<void> {
  const novas = propostas.map((p, i) => (i === indice ? { ...p, aplicada: true } : p));
  await getPrisma().agentMessage.update({
    where: { id: mensagemId },
    data: { proposals: novas as unknown as Prisma.InputJsonValue },
  });
}
