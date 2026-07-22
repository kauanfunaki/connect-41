// Geração de itens de kanban a partir de RecurringObligation — rodada pelo
// mesmo scheduler interno do motor de alertas (src/lib/alerts.ts), a cada
// ~15min. Cada obrigação gera no máximo 1 item por período (dia/semana/
// quinzena/mês, conforme `frequency`) — dedup via AlertDispatch com chave
// OBLIGATION:{id}:{periodo} e `sentOn` fixo no início do período em UTC (a
// unicidade tenant+chave+sentOn segura duplicata mesmo entre execuções em
// dias diferentes). Obrigação criada no meio do período gera o item do
// período corrente na próxima execução (até 15min).
import { getPrisma } from "@/lib/prisma";
import { notifyUser, notifySector } from "@/lib/notifications";
import { formatCalendarDate } from "@/lib/format";
import type { RecurringFrequency } from "@/generated/prisma/enums";

const DAY_MS = 24 * 60 * 60 * 1000;

// Segunda-feira fixa usada só como referência de paridade para BIWEEKLY —
// não tem relação com nenhum tenant específico, é só um relógio compartilhado
// pra decidir "semana par ou ímpar" de forma estável entre execuções.
const WEEK_EPOCH_MONDAY = Date.UTC(2024, 0, 1); // 2024-01-01 é segunda-feira

function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function lastDayOfMonthUTC(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

// Segunda-feira 00:00 UTC da semana que contém `date`.
function startOfWeekUTC(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const isoWeekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=segunda..7=domingo
  return new Date(d.getTime() - (isoWeekday - 1) * DAY_MS);
}

function dateKeyUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
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

type Period = { key: string; sentOn: Date; target: Date } | null;

// Decide se a obrigação tem um período "ativo" agora e, se sim, qual a data
// alvo (antes da prorrogação) e a chave de dedup/sentOn desse período.
function resolvePeriod(
  ob: { frequency: RecurringFrequency; dayOfMonth: number | null; dayOfWeek: number | null },
  now: Date
): Period {
  if (ob.frequency === "MONTHLY") {
    if (!ob.dayOfMonth) return null;
    const monthStart = startOfMonthUTC(now);
    const day = Math.min(ob.dayOfMonth, lastDayOfMonthUTC(now));
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
    const monthKey = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`;
    return { key: monthKey, sentOn: monthStart, target };
  }

  if (ob.frequency === "DAILY") {
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { key: dateKeyUTC(target), sentOn: target, target };
  }

  // WEEKLY / BIWEEKLY
  if (!ob.dayOfWeek) return null;
  const weekStart = startOfWeekUTC(now);
  if (ob.frequency === "BIWEEKLY") {
    const weeksSinceEpoch = Math.round((weekStart.getTime() - WEEK_EPOCH_MONDAY) / (7 * DAY_MS));
    if (weeksSinceEpoch % 2 !== 0) return null; // semana ímpar — pula esta quinzena
  }
  const target = new Date(weekStart.getTime() + (ob.dayOfWeek - 1) * DAY_MS);
  return { key: dateKeyUTC(weekStart), sentOn: weekStart, target };
}

export async function generateRecurringObligations(): Promise<{ generated: number }> {
  const prisma = getPrisma();
  const now = new Date();

  const obligations = await prisma.recurringObligation.findMany({
    where: { active: true },
    include: { company: { select: { name: true } } },
  });
  if (obligations.length === 0) return { generated: 0 };

  // Feriados dos próximos ~45 dias (a prorrogação pode atravessar a virada de mês)
  const holidayRows = await prisma.holiday.findMany({
    where: { date: { gte: startOfMonthUTC(now), lte: new Date(now.getTime() + 45 * DAY_MS) } },
    select: { tenantId: true, date: true },
  });
  const holidaysByTenant = new Map<string, Set<number>>();
  for (const h of holidayRows) {
    if (!holidaysByTenant.has(h.tenantId)) holidaysByTenant.set(h.tenantId, new Set());
    holidaysByTenant.get(h.tenantId)!.add(h.date.getTime());
  }

  let generated = 0;
  for (const ob of obligations) {
    const period = resolvePeriod(ob, now);
    if (!period) continue; // biweek pulada, ou falta configuração (dayOfMonth/dayOfWeek)

    const key = `OBLIGATION:${ob.id}:${period.key}`;
    try {
      await prisma.alertDispatch.create({
        data: { tenantId: ob.tenantId, alertKey: key, sentOn: period.sentOn },
      });
    } catch {
      continue; // já gerada neste período
    }

    try {
      const dueDate = nextBusinessDay(period.target, holidaysByTenant.get(ob.tenantId) ?? new Set());

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
      // O dedup já foi gravado; um erro aqui deixaria o período sem item. Remove
      // a reserva pra próxima execução tentar de novo.
      console.error(`[obligations] falha ao gerar item da obrigação ${ob.id}`, err);
      await prisma.alertDispatch
        .deleteMany({ where: { tenantId: ob.tenantId, alertKey: key, sentOn: period.sentOn } })
        .catch(() => {});
    }
  }

  return { generated };
}
