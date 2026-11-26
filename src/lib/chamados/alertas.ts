import { getPrisma } from "@/lib/prisma";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { configDoHelpdesk } from "./contexto";
import { despacharEventos } from "./notificacoes";
import { diaDoPrazo } from "./teste";

export async function verificarSla(tenantId: string, agora: Date) {
  if (!(await configDoHelpdesk(tenantId)).enabled) return 0;
  const ciclos = await getPrisma().helpdeskSlaCycle.findMany({ where: { tenantId, resolvedAt: null, pausedAt: null, resolutionDueAt: { lt: agora }, ticket: { status: { notIn: ["RESOLVIDO", "CANCELADO"] } } }, select: { id: true, ticketId: true }, take: 1000 });
  for (const c of ciclos) {
    try { await getPrisma().helpdeskEvent.create({ data: { tenantId, ticketId: c.ticketId, type: "sla", data: {}, internal: true, dedupKey: `sla:${c.id}:resolution` } }); }
    catch (err) { if (!isPrismaUniqueError(err)) throw err; }
  }
  // O motor passa o começo do dia; o teste vence no fim do dia escolhido, então a conta é com a hora de agora.
  await marcarTestesVencidos(tenantId, new Date());
  return despacharEventos(tenantId);
}

/**
 * O teste com o prazo vencido e sem retorno (26/11/2026, funcionalidade-853):
 * não conclui sozinho. Ganha um evento "teste" vencido, uma vez por prazo
 * (prorrogar e vencer de novo avisa de novo), e o despacho avisa quem abriu e
 * a equipe que atende.
 */
export async function marcarTestesVencidos(tenantId: string, agora: Date) {
  const vencidos = await getPrisma().helpdeskTicket.findMany({ where: { tenantId, status: "EM_TESTE", testDueAt: { lt: agora } }, select: { id: true, testDueAt: true }, take: 1000 });
  let marcados = 0;
  for (const t of vencidos) {
    if (!t.testDueAt) continue;
    try {
      await getPrisma().helpdeskEvent.create({ data: { tenantId, ticketId: t.id, type: "teste", data: { acao: "vencido", ate: diaDoPrazo(t.testDueAt) }, internal: false, dedupKey: `teste_vencido:${t.id}:${t.testDueAt.getTime()}` } });
      marcados++;
    } catch (err) { if (!isPrismaUniqueError(err)) throw err; }
  }
  return marcados;
}
