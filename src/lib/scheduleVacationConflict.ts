// Validação cruzada Escala × Férias: um dia de trabalho lançado na escala não
// pode cair dentro de um período de férias já aprovado do colaborador, e
// férias não pode ser aprovada/programada sobre uma escala de trabalho já
// lançada — nenhum dos dois lados sobrescreve o outro silenciosamente, o
// usuário precisa resolver o conflito manualmente antes.
import { getPrisma } from "@/lib/prisma";
import type { VacationStatus } from "@/generated/prisma/enums";

// Estágios em que a férias está confirmada o suficiente para travar escala
// nova — os estágios anteriores (PLANEJADA/SOLICITADA/EM_ANALISE) ainda podem
// não se confirmar, então não bloqueiam.
export const COMMITTED_VACATION_STATUSES: VacationStatus[] = ["APROVADA", "PROGRAMADA", "EM_GOZO"];

export type VacationConflict = { id: string; startDate: Date; returnDate: Date };

export async function findVacationConflictForDate(
  tenantId: string,
  personId: string,
  date: Date
): Promise<VacationConflict | null> {
  const prisma = getPrisma();
  const vacation = await prisma.vacation.findFirst({
    where: {
      tenantId,
      personId,
      status: { in: COMMITTED_VACATION_STATUSES },
      startDate: { lte: date },
      returnDate: { gte: date },
    },
    select: { id: true, startDate: true, returnDate: true },
  });
  if (!vacation || !vacation.startDate || !vacation.returnDate) return null;
  return { id: vacation.id, startDate: vacation.startDate, returnDate: vacation.returnDate };
}

export type ScheduleConflict = { id: string; date: Date };

export async function findScheduleConflictsForVacationPeriod(
  tenantId: string,
  personId: string,
  startDate: Date,
  returnDate: Date
): Promise<ScheduleConflict[]> {
  const prisma = getPrisma();
  return prisma.scheduleEntry.findMany({
    where: {
      tenantId,
      personId,
      dayOff: false,
      isHoliday: false,
      status: { not: "CANCELADA" },
      date: { gte: startDate, lte: returnDate },
    },
    select: { id: true, date: true },
    orderBy: { date: "asc" },
  });
}
