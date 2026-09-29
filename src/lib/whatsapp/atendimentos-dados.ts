// O lado do banco dos atendimentos — ver `atendimentos.ts`.

import { getPrisma } from "@/lib/prisma";
import type { Desfecho } from "@/lib/whatsapp/atendimentos";

/** O atendimento aberto desta conversa, se houver. */
export async function atendimentoAberto(threadId: string): Promise<{ id: string; abertoEm: Date } | null> {
  return getPrisma().whatsappAtendimento.findFirst({
    where: { threadId, encerradoEm: null },
    orderBy: { abertoEm: "desc" },
    select: { id: true, abertoEm: true },
  });
}

/**
 * O atendimento em que uma mensagem entra: o aberto, ou um novo a partir de
 * `agora`. É o que faz o assistente se apresentar de novo e ler só o que foi
 * dito depois — a conversa anterior foi encerrada.
 */
export async function garantirAtendimentoAberto(
  tenantId: string,
  threadId: string,
  agora: Date
): Promise<{ id: string; abertoEm: Date }> {
  const aberto = await atendimentoAberto(threadId);
  if (aberto) return aberto;
  return getPrisma().whatsappAtendimento.create({
    data: { tenantId, threadId, abertoEm: agora },
    select: { id: true, abertoEm: true },
  });
}

/**
 * Fecha o que estiver aberto. `updateMany`, e não o último: duas mensagens
 * chegando juntas numa conversa encerrada podem abrir dois, e fechar só um
 * deixaria o outro pendurado para sempre.
 */
export async function fecharAtendimentos(
  threadId: string,
  params: { agora: Date; porId: string | null; desfecho: Desfecho }
): Promise<number> {
  const r = await getPrisma().whatsappAtendimento.updateMany({
    where: { threadId, encerradoEm: null },
    data: { encerradoEm: params.agora, encerradoPorId: params.porId, desfecho: params.desfecho },
  });
  return r.count;
}
