// Os avisos do Atendimento. Todos levam o id do ciclo em `entityId`, e o link
// é `/atendimento/{id}` (`src/lib/notificacaoLink.ts`, prefixo ATENDIMENTO_).
//
// Avisar nunca derruba quem chamou: o webhook e as ações seguem mesmo se o
// aviso falhar, e a falha fica no log.

import { notifySector, notifyUser } from "@/lib/notifications";

type Base = { tenantId: string; cicloId: string; actorUserId?: string | null };

async function seguro(trabalho: () => Promise<void>): Promise<void> {
  try {
    await trabalho();
  } catch (err) {
    console.error("[atendimento:aviso]", err);
  }
}

/** Conversa nova na triagem: todos da triagem. */
export function avisarTriagem(p: Base & { triagem: string; quem: string; previa: string }) {
  return seguro(() =>
    notifySector(p.triagem, {
      tenantId: p.tenantId,
      type: "ATENDIMENTO_NOVO",
      message: `${p.quem}: ${p.previa}`,
      entityId: p.cicloId,
    })
  );
}

/** Encaminhada ao setor (direto ou por pedido aprovado): todos do setor, ou a pessoa escolhida. */
export function avisarEncaminhamento(p: Base & { sectorCode: string; paraUserId: string | null; quem: string; nota: string | null }) {
  const message = `Atendimento novo: ${p.quem}${p.nota ? ` — ${p.nota}` : ""}`;
  return seguro(() =>
    p.paraUserId
      ? notifyUser(p.paraUserId, { tenantId: p.tenantId, type: "ATENDIMENTO_ENCAMINHADO", message, entityId: p.cicloId, actorUserId: p.actorUserId })
      : notifySector(p.sectorCode, { tenantId: p.tenantId, type: "ATENDIMENTO_ENCAMINHADO", message, entityId: p.cicloId, actorUserId: p.actorUserId })
  );
}

/** Transferida para uma pessoa do setor. */
export function avisarTransferencia(p: Base & { paraUserId: string; quem: string }) {
  return seguro(() =>
    notifyUser(p.paraUserId, {
      tenantId: p.tenantId,
      type: "ATENDIMENTO_TRANSFERIDO",
      message: `Conversa transferida para você: ${p.quem}`,
      entityId: p.cicloId,
      actorUserId: p.actorUserId,
    })
  );
}

/** O cliente escreveu numa conversa que já tem responsável (ou que está num setor sem responsável). */
export function avisarResposta(p: Base & { paraUserId: string | null; sectorCode: string | null; quem: string; previa: string }) {
  const input = { tenantId: p.tenantId, type: "ATENDIMENTO_RESPOSTA", message: `${p.quem}: ${p.previa}`, entityId: p.cicloId };
  return seguro(async () => {
    if (p.paraUserId) await notifyUser(p.paraUserId, input);
    else if (p.sectorCode) await notifySector(p.sectorCode, input);
  });
}

/** Pedido de troca de setor: a triagem decide. */
export function avisarPedido(p: Base & { triagem: string; quem: string; de: string; para: string }) {
  return seguro(() =>
    notifySector(p.triagem, {
      tenantId: p.tenantId,
      type: "ATENDIMENTO_PEDIDO",
      message: `Pedido de encaminhamento: ${p.quem}, de ${p.de} para ${p.para}`,
      entityId: p.cicloId,
      actorUserId: p.actorUserId,
    })
  );
}

/** A triagem decidiu o pedido: quem pediu fica sabendo. */
export function avisarDecisao(p: Base & { paraUserId: string; aprovado: boolean; quem: string; setor: string | null }) {
  return seguro(() =>
    notifyUser(p.paraUserId, {
      tenantId: p.tenantId,
      type: "ATENDIMENTO_PEDIDO_DECIDIDO",
      message: p.aprovado
        ? `Pedido aprovado: ${p.quem} foi para ${p.setor ?? "outro setor"}`
        : `Pedido recusado: ${p.quem} continua com você`,
      entityId: p.cicloId,
      actorUserId: p.actorUserId,
    })
  );
}
