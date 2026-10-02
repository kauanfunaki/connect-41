// O painel do orquestrador em `/admin/ia`: como o chat está sendo usado.
//
// **Só contagens.** A conversa é da pessoa (decisão de 25/09) — o administrador
// vê quantas perguntas cada IA recebeu, quantas foram passadas a outro setor,
// quantas não tinham IA e quantas falharam, e nunca o que foi perguntado.
// É daqui que sai o que construir depois: o setor que mais recebe pergunta sem
// IA é o próximo agente.
//
// A exceção (02/10/2026) são as respostas com 👎: quem marca é avisado, na
// hora, de que aquela pergunta e aquela resposta vão para a revisão aqui —
// sem o nome da pessoa e sem o resto da conversa. É o que mostra onde a IA erra.

import { getPrisma } from "@/lib/prisma";
import { filtrarCitacoes } from "./citacoes";
import { separarAnexos } from "./anexos-regras";
import { ehMotivoDoNao, type MotivoDoNao } from "./regras";

export const DIAS_DO_PAINEL = 30;

/** Respostas com 👎 que o painel lista. */
export const RUINS_NO_PAINEL = 20;

export type AvaliacoesDaIa = { agentCode: string; boas: number; ruins: number; motivos: Partial<Record<MotivoDoNao, number>> };

export type RespostaRuim = {
  id: string;
  agentCode: string;
  motivo: MotivoDoNao | null;
  pergunta: string | null;
  resposta: string;
  avaliadaEm: string;
};

export type PainelDoOrquestrador = {
  perguntas: { agentCode: string; perguntas: number; pessoas: number; falhas: number }[];
  encaminhamentos: { de: string; para: string; respondidas: number; transferencias: number; semDestino: number }[];
  semIa: Record<string, number>;
  avaliacoes: AvaliacoesDaIa[];
  ruins: RespostaRuim[];
};

/** 👍 e 👎 por IA, com os motivos do 👎. Puro — testado. A pior taxa vem primeiro. */
export function somarAvaliacoes(linhas: { agentCode: string; rating: "BOA" | "RUIM" | null; ratingReason: string | null }[]): AvaliacoesDaIa[] {
  const porIa = new Map<string, AvaliacoesDaIa>();
  for (const l of linhas) {
    if (!l.rating) continue;
    const a = porIa.get(l.agentCode) ?? { agentCode: l.agentCode, boas: 0, ruins: 0, motivos: {} };
    if (l.rating === "BOA") a.boas++;
    else {
      a.ruins++;
      if (ehMotivoDoNao(l.ratingReason)) a.motivos[l.ratingReason] = (a.motivos[l.ratingReason] ?? 0) + 1;
    }
    porIa.set(l.agentCode, a);
  }
  const taxa = (a: AvaliacoesDaIa) => a.ruins / (a.boas + a.ruins);
  return [...porIa.values()].sort((a, b) => taxa(b) - taxa(a) || b.ruins - a.ruins);
}

/** A resposta como o administrador lê: citação vira só o nome, sem o negrito do markdown. */
export function textoParaRevisao(texto: string, max = 600): string {
  const limpo = filtrarCitacoes(texto, new Set()).replace(/\*\*([^*\n]+)\*\*/g, "$1");
  return limpo.length > max ? `${limpo.slice(0, max).trimEnd()}…` : limpo;
}

type Encaminhado = { de?: unknown; para?: unknown; desfecho?: unknown };

/** Soma os encaminhamentos do log por par de/para. Puro — testado. */
export function somarEncaminhamentos(linhas: { action: string; metadata: unknown }[]) {
  const pares = new Map<string, { de: string; para: string; respondidas: number; transferencias: number; semDestino: number }>();
  const semIa: Record<string, number> = {};
  for (const l of linhas) {
    const m = (l.metadata ?? {}) as Encaminhado;
    const de = typeof m.de === "string" ? m.de : "?";
    const para = typeof m.para === "string" ? m.para : "?";
    if (l.action === "ia.chat.sem_ia") {
      semIa[de] = (semIa[de] ?? 0) + 1;
      continue;
    }
    const chave = `${de}→${para}`;
    const p = pares.get(chave) ?? { de, para, respondidas: 0, transferencias: 0, semDestino: 0 };
    if (m.desfecho === "respondida") p.respondidas++;
    else if (m.desfecho === "transferencia_oferecida") p.transferencias++;
    else p.semDestino++;
    pares.set(chave, p);
  }
  return {
    encaminhamentos: [...pares.values()].sort(
      (a, b) => b.respondidas + b.transferencias + b.semDestino - (a.respondidas + a.transferencias + a.semDestino)
    ),
    semIa,
  };
}

export async function painelDoOrquestrador(tenantId: string, agora: Date): Promise<PainelDoOrquestrador | null> {
  const desde = new Date(agora.getTime() - DIAS_DO_PAINEL * 24 * 60 * 60 * 1000);
  const prisma = getPrisma();
  try {
    const [mensagens, logs, avaliadas] = await Promise.all([
      prisma.agentMessage.findMany({
        where: { createdAt: { gte: desde }, conversation: { tenantId } },
        select: { role: true, failed: true, conversation: { select: { agentCode: true, userId: true } } },
      }),
      prisma.auditLog.findMany({
        where: { tenantId, createdAt: { gte: desde }, action: { in: ["ia.chat.encaminhada", "ia.chat.sem_ia"] } },
        select: { action: true, metadata: true },
      }),
      prisma.agentMessage.findMany({
        where: { ratedAt: { gte: desde }, rating: { not: null }, conversation: { tenantId } },
        select: { id: true, rating: true, ratingReason: true, conversationId: true, createdAt: true, ratedAt: true, conversation: { select: { agentCode: true } } },
        orderBy: { ratedAt: "desc" },
      }),
    ]);

    // As últimas com 👎, cada uma com a pergunta que veio logo antes.
    const ultimasRuins = avaliadas.filter((m) => m.rating === "RUIM").slice(0, RUINS_NO_PAINEL);
    const ruins = await Promise.all(
      ultimasRuins.map(async (m): Promise<RespostaRuim> => {
        const [resposta, pergunta] = await Promise.all([
          prisma.agentMessage.findUnique({ where: { id: m.id }, select: { content: true } }),
          prisma.agentMessage.findFirst({
            where: { conversationId: m.conversationId, role: "USUARIO", createdAt: { lte: m.createdAt } },
            orderBy: { createdAt: "desc" },
            select: { content: true },
          }),
        ]);
        return {
          id: m.id,
          agentCode: m.conversation.agentCode,
          motivo: ehMotivoDoNao(m.ratingReason) ? m.ratingReason : null,
          pergunta: pergunta ? textoParaRevisao(separarAnexos(pergunta.content).texto, 300) : null,
          resposta: textoParaRevisao(resposta?.content ?? ""),
          avaliadaEm: (m.ratedAt ?? m.createdAt).toISOString(),
        };
      })
    );

    const porIa = new Map<string, { perguntas: number; pessoas: Set<string>; falhas: number }>();
    for (const m of mensagens) {
      const code = m.conversation.agentCode;
      const linha = porIa.get(code) ?? { perguntas: 0, pessoas: new Set<string>(), falhas: 0 };
      if (m.role === "USUARIO") {
        linha.perguntas++;
        linha.pessoas.add(m.conversation.userId);
      }
      if (m.failed) linha.falhas++;
      porIa.set(code, linha);
    }

    return {
      perguntas: [...porIa.entries()]
        .map(([agentCode, l]) => ({ agentCode, perguntas: l.perguntas, pessoas: l.pessoas.size, falhas: l.falhas }))
        .sort((a, b) => b.perguntas - a.perguntas),
      ...somarEncaminhamentos(logs),
      avaliacoes: somarAvaliacoes(avaliadas.map((m) => ({ agentCode: m.conversation.agentCode, rating: m.rating, ratingReason: m.ratingReason }))),
      ruins,
    };
  } catch (err) {
    // Tabelas do chat ausentes (migration não rodou): o painel some, a tela fica.
    console.error("[chat-ia] painel do orquestrador", err);
    return null;
  }
}
