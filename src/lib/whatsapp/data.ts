// Leitura das conversas para a tela.

import { getPrisma } from "@/lib/prisma";
import { ordenarConversas, type ConversaParaTela } from "@/lib/whatsapp/conversas";

export type LinhaDeConversa = ConversaParaTela & {
  id: string;
  waPhone: string;
  nome: string | null;
  vaga: string | null;
  /** O começo da última mensagem, para a lista dar contexto sem abrir. */
  ultimaMensagem: string | null;
  ultimaMensagemEm: Date | null;
  handoffReason: string | null;
  naoRespondidas: number;
};

/**
 * As conversas de um cliente, já na ordem da fila.
 *
 * Uma consulta para as threads e uma para a última mensagem de cada — e não uma
 * por thread. Com o piloto rodando, "uma por linha" é o que transforma uma tela
 * de trinta conversas em sessenta viagens ao banco.
 */
export async function listarConversas(tenantId: string, agora: Date): Promise<LinhaDeConversa[]> {
  const prisma = getPrisma();
  const threads = await prisma.whatsappThread.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      waPhone: true,
      optedOutAt: true,
      handoffAt: true,
      handoffReason: true,
      lastInboundAt: true,
      candidaturaId: true,
    },
  });
  if (threads.length === 0) return [];

  const ids = threads.map((t) => t.id);
  const [ultimas, candidaturas] = await Promise.all([
    prisma.whatsappMessage.findMany({
      where: { threadId: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: { threadId: true, body: true, createdAt: true, direction: true },
    }),
    prisma.candidatura.findMany({
      where: {
        tenantId,
        id: { in: threads.map((t) => t.candidaturaId).filter((v): v is string => !!v) },
      },
      select: { id: true, person: { select: { name: true } }, vaga: { select: { title: true } } },
    }),
  ]);

  // A consulta veio em ordem decrescente, então a primeira de cada thread é a
  // última mensagem, e as de ENTRADA antes da primeira SAIDA são exatamente as
  // que ninguém respondeu. `fechada` marca onde parar de contar.
  const ultimaPorThread = new Map<string, { body: string; createdAt: Date }>();
  const naoRespondidas = new Map<string, number>();
  const fechada = new Set<string>();
  for (const m of ultimas) {
    if (!ultimaPorThread.has(m.threadId)) {
      ultimaPorThread.set(m.threadId, { body: m.body, createdAt: m.createdAt });
    }
    if (fechada.has(m.threadId)) continue;
    if (m.direction === "ENTRADA") {
      naoRespondidas.set(m.threadId, (naoRespondidas.get(m.threadId) ?? 0) + 1);
    } else {
      fechada.add(m.threadId);
    }
  }

  const candidaturaPorId = new Map(candidaturas.map((c) => [c.id, c]));

  const linhas: LinhaDeConversa[] = threads.map((t) => {
    const ultima = ultimaPorThread.get(t.id) ?? null;
    const c = t.candidaturaId ? candidaturaPorId.get(t.candidaturaId) : null;
    return {
      id: t.id,
      waPhone: t.waPhone,
      nome: c?.person.name ?? null,
      vaga: c?.vaga.title ?? null,
      ultimaMensagem: ultima?.body.slice(0, 120) ?? null,
      ultimaMensagemEm: ultima?.createdAt ?? null,
      optedOutAt: t.optedOutAt,
      handoffAt: t.handoffAt,
      handoffReason: t.handoffReason,
      lastInboundAt: t.lastInboundAt,
      candidaturaId: t.candidaturaId,
      naoRespondidas: naoRespondidas.get(t.id) ?? 0,
    };
  });

  return ordenarConversas(linhas, agora);
}

export type MensagemNaTela = {
  id: string;
  direction: "ENTRADA" | "SAIDA";
  body: string;
  createdAt: Date;
  status: string | null;
  error: string | null;
  /** Veio do robô? É o que distingue o que uma pessoa escreveu. */
  doRobo: boolean;
};

export type ConversaDetalhada = LinhaDeConversa & { mensagens: MensagemNaTela[] };

export async function lerConversa(
  tenantId: string,
  threadId: string
): Promise<ConversaDetalhada | null> {
  const prisma = getPrisma();
  const thread = await prisma.whatsappThread.findFirst({
    where: { id: threadId, tenantId },
    select: {
      id: true,
      waPhone: true,
      optedOutAt: true,
      handoffAt: true,
      handoffReason: true,
      lastInboundAt: true,
      candidaturaId: true,
    },
  });
  if (!thread) return null;

  const [mensagens, candidatura] = await Promise.all([
    prisma.whatsappMessage.findMany({
      where: { threadId, tenantId },
      orderBy: { createdAt: "asc" },
      take: 300,
      select: {
        id: true,
        direction: true,
        body: true,
        createdAt: true,
        status: true,
        error: true,
        agentRunId: true,
      },
    }),
    thread.candidaturaId
      ? prisma.candidatura.findFirst({
          where: { id: thread.candidaturaId, tenantId },
          select: { person: { select: { name: true } }, vaga: { select: { title: true } } },
        })
      : null,
  ]);

  const ultima = mensagens.length > 0 ? mensagens[mensagens.length - 1]! : null;
  let naoRespondidas = 0;
  for (let i = mensagens.length - 1; i >= 0; i--) {
    if (mensagens[i]!.direction !== "ENTRADA") break;
    naoRespondidas++;
  }

  return {
    id: thread.id,
    waPhone: thread.waPhone,
    nome: candidatura?.person.name ?? null,
    vaga: candidatura?.vaga.title ?? null,
    ultimaMensagem: ultima?.body.slice(0, 120) ?? null,
    ultimaMensagemEm: ultima?.createdAt ?? null,
    optedOutAt: thread.optedOutAt,
    handoffAt: thread.handoffAt,
    handoffReason: thread.handoffReason,
    lastInboundAt: thread.lastInboundAt,
    candidaturaId: thread.candidaturaId,
    naoRespondidas,
    mensagens: mensagens.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt,
      status: m.status,
      error: m.error,
      doRobo: m.agentRunId !== null,
    })),
  };
}
