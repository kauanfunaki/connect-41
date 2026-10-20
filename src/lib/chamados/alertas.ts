import { getPrisma } from "@/lib/prisma";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { configDoHelpdesk } from "./contexto";
import { despacharEventos } from "./notificacoes";

export async function verificarSla(tenantId: string, agora: Date) {
  if (!(await configDoHelpdesk(tenantId)).enabled) return 0;
  const ciclos = await getPrisma().helpdeskSlaCycle.findMany({ where: { tenantId, resolvedAt: null, pausedAt: null, resolutionDueAt: { lt: agora }, ticket: { status: { notIn: ["RESOLVIDO", "CANCELADO"] } } }, select: { id: true, ticketId: true }, take: 1000 });
  for (const c of ciclos) {
    try { await getPrisma().helpdeskEvent.create({ data: { tenantId, ticketId: c.ticketId, type: "sla", data: {}, internal: true, dedupKey: `sla:${c.id}:resolution` } }); }
    catch (err) { if (!isPrismaUniqueError(err)) throw err; }
  }
  return despacharEventos(tenantId);
}
