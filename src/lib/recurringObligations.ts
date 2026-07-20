// Geração mensal de itens de kanban a partir de RecurringObligation — rodada
// pelo mesmo scheduler interno do motor de alertas (src/lib/alerts.ts).
// Cada obrigação gera no máximo 1 item por mês (dedup via AlertDispatch com
// chave OBLIGATION:{id}:{yyyy-MM} e sentOn fixo no dia 1º do mês UTC — a
// unicidade tenant+chave+sentOn segura duplicata mesmo entre execuções em
// dias diferentes). Obrigação criada no meio do mês gera o item do mês
// corrente na próxima execução (até 15min).
import { getPrisma } from "@/lib/prisma";
import { notifyUser, notifySector } from "@/lib/notifications";
import { formatCalendarDate } from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function lastDayOfMonthUTC(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

// Prorroga para o próximo dia útil quando cai em fim de semana ou feriado —
// padrão das obrigações fiscais brasileiras (DAS/DCTF prorrogam, não antecipam).
function nextBusinessDay(date: Date, holidays: Set<number>): Date {
  let d = date;
  for (let i = 0; i < 14; i++) {
    const weekday = d.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(d.getTime())) return d;
    d = new Date(d.getTime() + DAY_MS);
  }
  return d; // 14 dias seguidos de folga não existem — fallback defensivo
}

export async function generateRecurringObligations(): Promise<{ generated: number }> {
  const prisma = getPrisma();
  const now = new Date();
  const monthStart = startOfMonthUTC(now);
  const monthKey = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`;

  const obligations = await prisma.recurringObligation.findMany({
    where: { active: true },
    include: { company: { select: { name: true } } },
  });
  if (obligations.length === 0) return { generated: 0 };

  // Feriados do mês corrente + começo do próximo (a prorrogação pode atravessar a virada)
  const holidayRows = await prisma.holiday.findMany({
    where: { date: { gte: monthStart, lte: new Date(monthStart.getTime() + 45 * DAY_MS) } },
    select: { tenantId: true, date: true },
  });
  const holidaysByTenant = new Map<string, Set<number>>();
  for (const h of holidayRows) {
    if (!holidaysByTenant.has(h.tenantId)) holidaysByTenant.set(h.tenantId, new Set());
    holidaysByTenant.get(h.tenantId)!.add(h.date.getTime());
  }

  let generated = 0;
  for (const ob of obligations) {
    const key = `OBLIGATION:${ob.id}:${monthKey}`;
    try {
      await prisma.alertDispatch.create({
        data: { tenantId: ob.tenantId, alertKey: key, sentOn: monthStart },
      });
    } catch {
      continue; // já gerada neste mês
    }

    try {
      const day = Math.min(ob.dayOfMonth, lastDayOfMonthUTC(now));
      const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
      const dueDate = nextBusinessDay(target, holidaysByTenant.get(ob.tenantId) ?? new Set());

      const firstStage = await prisma.pipelineStage.findFirst({
        where: { pipelineId: ob.pipelineId },
        orderBy: { order: "asc" },
      });
      if (!firstStage) {
        console.error(`[obligations] pipeline ${ob.pipelineId} sem estágios — obrigação ${ob.id} pulada`);
        continue;
      }

      await prisma.pipelineItem.create({
        data: {
          tenantId: ob.tenantId,
          pipelineId: ob.pipelineId,
          stageId: firstStage.id,
          entityType: "COMPANY",
          entityId: ob.companyId,
          dueDate,
          description: ob.description ? `${ob.title}\n\n${ob.description}` : ob.title,
          assignees: ob.responsibleId ? { create: [{ userId: ob.responsibleId }] } : undefined,
        },
      });

      const message = `Obrigação "${ob.title}" (${ob.company.name}) gerada — vence em ${formatCalendarDate(dueDate)}.`;
      if (ob.responsibleId) {
        await notifyUser(ob.responsibleId, { tenantId: ob.tenantId, type: "OBLIGATION_GENERATED", message, entityType: "COMPANY", entityId: ob.companyId });
      } else {
        await notifySector(ob.sectorCode, { tenantId: ob.tenantId, type: "OBLIGATION_GENERATED", message, entityType: "COMPANY", entityId: ob.companyId });
      }
      generated++;
    } catch (err) {
      // O dedup já foi gravado; um erro aqui deixaria o mês sem item. Remove a
      // reserva pra próxima execução tentar de novo.
      console.error(`[obligations] falha ao gerar item da obrigação ${ob.id}`, err);
      await prisma.alertDispatch
        .deleteMany({ where: { tenantId: ob.tenantId, alertKey: key, sentOn: monthStart } })
        .catch(() => {});
    }
  }

  return { generated };
}
