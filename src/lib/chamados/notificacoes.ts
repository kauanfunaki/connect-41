import { createHash } from "crypto";
import { getPrisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { configDoHelpdesk } from "./contexto";
import { strings } from "./consultas";
import { ROTULOS, aguardandoSolicitante, avisoDaTriagem, triagemSchema } from "./regras";

import { ROTULOS_EVENTO } from "./eventos";
export { ROTULOS_EVENTO } from "./eventos";
export function idDaNotificacao(eventId: string, userId: string) {
  const h = createHash("sha256").update(`helpdesk:${eventId}:${userId}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function despacharEventos(tenantId: string, ticketId?: string) {
  const config = await configDoHelpdesk(tenantId); if (!config.enabled) return 0;
  const eventos = await getPrisma().helpdeskEvent.findMany({ where: { tenantId, dispatchedAt: null, ...(ticketId ? { ticketId } : {}) }, include: { ticket: { include: { participants: true, assignees: true } } }, orderBy: { createdAt: "asc" }, take: 100 });
  let enviados = 0;
  for (const e of eventos) {
    const t = e.ticket;
    if (e.type === "triagem") {
      try { enviados += await avisarATriagem(tenantId, e, t); await getPrisma().helpdeskEvent.update({ where: { id: e.id }, data: { dispatchedAt: new Date() } }); }
      catch { console.warn("[helpdesk] Entrega pendente para retomada."); }
      continue;
    }
    const participantes = [t.createdById, ...t.participants.map(p => p.userId), ...(t.approvalStatus === "PENDING" ? strings(t.approverIds) : [])];
    const usuarios = await getPrisma().user.findMany({ where: { tenantId, active: true, id: { not: e.actorId ?? "" }, OR: [
      // A equipe do setor que atende o chamado (12/11/2026); no redirecionamento, já o novo.
      { role: { not: "READONLY" }, sectors: { some: { sectorCode: t.handlingSectorCode } } },
      ...(!e.internal ? [{ id: { in: participantes } }, { role: "SECTOR_ADMIN" as const, sectors: { some: { sectorCode: t.requesterSectorCode } } }] : []),
    ] }, select: { id: true } });
    const data = e.data as Record<string, string>;
    const descricao = e.type === "status" ? `Situação: ${ROTULOS[data.to as keyof typeof ROTULOS] ?? "atualizada"}` : ROTULOS_EVENTO[e.type] ?? "Chamado atualizado";
    // Quando o chamado passa a esperar o solicitante (27/10/2026), o aviso dele
    // é próprio, com tom de alerta: o atendimento está parado até ele responder.
    const esperaOSolicitante = e.type === "status" && aguardandoSolicitante(data.to ?? "");
    try {
      for (const u of usuarios) {
        const suaVez = esperaOSolicitante && u.id === t.createdById;
        await notifyUser(u.id, { tenantId, type: suaVez ? "CHAMADO_AGUARDANDO_VOCE" : e.type === "sla" ? "CHAMADO_SLA" : e.internal ? "CHAMADO_INTERNO" : "CHAMADO_ATUALIZADO", message: suaVez ? `Seu chamado aguarda a sua resposta: ${t.title}` : `${descricao}: ${t.title}`, entityId: t.id, actorUserId: e.actorId, deduplicationId: idDaNotificacao(e.id, u.id) });
      }
      await getPrisma().helpdeskEvent.update({ where: { id: e.id }, data: { dispatchedAt: new Date() } }); enviados += usuarios.length;
    } catch { console.warn("[helpdesk] Entrega pendente para retomada."); }
  }
  return enviados;
}
// O fim da triagem (10/11/2026) avisa quem abriu, com o resultado. A equipe já
// recebeu "Chamado aberto" no envio e não ganha outro aviso; os aprovadores, se
// a categoria pede aprovação, recebem o deles agora — no envio ainda não havia
// categoria.
type EventoDaTriagem = { id: string; data: unknown };
type ChamadoDoAviso = { id: string; title: string; createdById: string; approvalStatus: string; approverIds: unknown };
async function avisarATriagem(tenantId: string, e: EventoDaTriagem, t: ChamadoDoAviso) {
  const lida = triagemSchema.safeParse(e.data);
  const aprovadores = t.approvalStatus === "PENDING" ? strings(t.approverIds) : [];
  const ativos = new Set((await getPrisma().user.findMany({ where: { tenantId, active: true, id: { in: [t.createdById, ...aprovadores] } }, select: { id: true } })).map(u => u.id));
  let enviados = 0;
  if (ativos.has(t.createdById)) {
    await notifyUser(t.createdById, { tenantId, type: "CHAMADO_TRIADO", message: lida.success ? avisoDaTriagem(lida.data, t.title) : `Triagem concluída: ${t.title}`, entityId: t.id, actorUserId: null, deduplicationId: idDaNotificacao(e.id, t.createdById) });
    enviados++;
  }
  for (const id of aprovadores.filter(a => a !== t.createdById && ativos.has(a))) {
    await notifyUser(id, { tenantId, type: "CHAMADO_ATUALIZADO", message: `Chamado aguardando a sua aprovação: ${t.title}`, entityId: t.id, actorUserId: null, deduplicationId: idDaNotificacao(e.id, id) });
    enviados++;
  }
  return enviados;
}
