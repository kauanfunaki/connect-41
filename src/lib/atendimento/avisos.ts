// Os avisos do Atendimento. Todos levam o id do ciclo em `entityId`, e o link
// é `/atendimento/{id}` (`src/lib/notificacaoLink.ts`, prefixo ATENDIMENTO_).
//
// Avisar nunca derruba quem chamou: o webhook e as ações seguem mesmo se o
// aviso falhar, e a falha fica no log.

import { notifySector, notifyUser } from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import type { QuemVeTudo } from "./regras";

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

/**
 * Conversa nova, para quem vê todos os atendimentos e ligou os avisos. Quem é
 * da triagem fica de fora: já recebeu o aviso da triagem.
 */
export function avisarQuemVeTudo(p: Base & { lista: readonly QuemVeTudo[]; triagem: string; quem: string; previa: string }) {
  const comAviso = p.lista.filter((q) => q.avisos);
  if (comAviso.length === 0) return Promise.resolve();
  return seguro(async () => {
    const pessoas = comAviso.filter((q) => q.tipo === "PESSOA").map((q) => q.id);
    const setores = comAviso.filter((q) => q.tipo === "SETOR").map((q) => q.id);
    const gente = await getPrisma().user.findMany({
      where: {
        tenantId: p.tenantId,
        active: true,
        OR: [{ id: { in: pessoas } }, ...(setores.length ? [{ sectors: { some: { sectorCode: { in: setores } } } }] : [])],
        NOT: { sectors: { some: { sectorCode: p.triagem } } },
      },
      select: { id: true },
    });
    for (const u of gente) {
      await notifyUser(u.id, { tenantId: p.tenantId, type: "ATENDIMENTO_NOVO", message: `${p.quem}: ${p.previa}`, entityId: p.cicloId });
    }
  });
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
      message: `Conversa passada para você: ${p.quem}. Assuma para responder.`,
      entityId: p.cicloId,
      actorUserId: p.actorUserId,
    })
  );
}

/**
 * O cliente escreveu de novo: só quem está com a conversa (12/11/2026). Depois
 * de uma transferência, o antigo responsável para de receber e o novo passa a
 * receber. Sem responsável, o setor da conversa. Quem decide é `quemAvisarNaResposta`.
 */
export function avisarResposta(p: Base & { para: { pessoa: string } | { setor: string } | null; quem: string; previa: string }) {
  const input = { tenantId: p.tenantId, type: "ATENDIMENTO_RESPOSTA", message: `${p.quem}: ${p.previa}`, entityId: p.cicloId };
  const para = p.para;
  if (!para) return Promise.resolve();
  return seguro(async () => {
    if ("pessoa" in para) await notifyUser(para.pessoa, input);
    else await notifySector(para.setor, input);
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

/** Alguém pediu para assumir a conversa: quem está com ela decide (13/11/2026). */
export function avisarPedidoDeAssumir(p: Base & { paraUserId: string; quemPede: string; cliente: string }) {
  return seguro(() =>
    notifyUser(p.paraUserId, {
      tenantId: p.tenantId,
      type: "ATENDIMENTO_PEDIDO_ASSUMIR",
      message: `${p.quemPede} pediu para assumir a conversa com ${p.cliente}`,
      entityId: p.cicloId,
      actorUserId: p.actorUserId,
    })
  );
}

/** O pedido para assumir foi decidido: quem pediu fica sabendo. */
export function avisarDecisaoDeAssumir(p: Base & { paraUserId: string; aceito: boolean; cliente: string }) {
  return seguro(() =>
    notifyUser(p.paraUserId, {
      tenantId: p.tenantId,
      type: "ATENDIMENTO_PEDIDO_ASSUMIR_DECIDIDO",
      message: p.aceito ? `A conversa com ${p.cliente} passou para você` : `O pedido para assumir a conversa com ${p.cliente} foi recusado`,
      entityId: p.cicloId,
      actorUserId: p.actorUserId,
    })
  );
}

/** A triagem tirou a pessoa da conversa: ela fica sabendo, com o motivo. */
export function avisarRetirada(p: Base & { paraUserId: string; cliente: string; motivo: string }) {
  return seguro(() =>
    notifyUser(p.paraUserId, {
      tenantId: p.tenantId,
      type: "ATENDIMENTO_RETIRADO",
      message: `A triagem tirou você da conversa com ${p.cliente}: ${p.motivo}`,
      entityId: p.cicloId,
      actorUserId: p.actorUserId,
    })
  );
}
