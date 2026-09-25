// O painel do orquestrador em `/admin/ia`: como o chat está sendo usado.
//
// **Só contagens.** A conversa é da pessoa (decisão de 25/09) — o administrador
// vê quantas perguntas cada IA recebeu, quantas foram passadas a outro setor,
// quantas não tinham IA e quantas falharam, e nunca o que foi perguntado.
// É daqui que sai o que construir depois: o setor que mais recebe pergunta sem
// IA é o próximo agente.

import { getPrisma } from "@/lib/prisma";

export const DIAS_DO_PAINEL = 30;

export type PainelDoOrquestrador = {
  perguntas: { agentCode: string; perguntas: number; pessoas: number; falhas: number }[];
  encaminhamentos: { de: string; para: string; respondidas: number; transferencias: number; semDestino: number }[];
  semIa: Record<string, number>;
};

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
    const [mensagens, logs] = await Promise.all([
      prisma.agentMessage.findMany({
        where: { createdAt: { gte: desde }, conversation: { tenantId } },
        select: { role: true, failed: true, conversation: { select: { agentCode: true, userId: true } } },
      }),
      prisma.auditLog.findMany({
        where: { tenantId, createdAt: { gte: desde }, action: { in: ["ia.chat.encaminhada", "ia.chat.sem_ia"] } },
        select: { action: true, metadata: true },
      }),
    ]);

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
    };
  } catch (err) {
    // Tabelas do chat ausentes (migration não rodou): o painel some, a tela fica.
    console.error("[chat-ia] painel do orquestrador", err);
    return null;
  }
}
