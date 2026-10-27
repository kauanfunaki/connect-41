import { createHash } from "crypto";
import { getPrisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { configDoHelpdesk } from "./contexto";
import { strings } from "./consultas";
import { ROTULOS, aguardandoSolicitante } from "./regras";

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
    const participantes = [t.createdById, ...t.participants.map(p => p.userId), ...(t.approvalStatus === "PENDING" ? strings(t.approverIds) : [])];
    const usuarios = await getPrisma().user.findMany({ where: { tenantId, active: true, id: { not: e.actorId ?? "" }, OR: [
      { role: { not: "READONLY" }, sectors: { some: { sectorCode: config.sectorCode } } },
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
