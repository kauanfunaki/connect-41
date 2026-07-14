import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { PageContainer } from "@/components/shared/PageContainer";
import { WeekCalendar } from "@/components/agenda/WeekCalendar";
import { criarReuniaoAvulsa, excluirReuniaoAvulsa } from "./actions";
import {
  saoPauloParts,
  saoPauloDateTimeToUtc,
  mondayOfWeek,
  weekDayKeys,
  addDaysToKey,
  monthYearLabel,
} from "@/lib/agenda";
import { redirect } from "next/navigation";

// Agenda semanal interativa — substitui a antiga lista "próximas/passadas".
// Reunião pode ser criada direto por aqui (clique num horário vazio ou botão
// "Nova reunião"), sem precisar passar por um item de Kanban primeiro:
// Meeting.pipelineItemId já é opcional no schema, a única mudança foi uma
// action nova (criarReuniaoAvulsa) que não exige esse vínculo.
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const ctx = await getAuthContext();
  if (!canManageMeetings(ctx)) redirect("/");

  const mondayKey = mondayOfWeek(week);
  const days = weekDayKeys(mondayKey);
  const todayKey = saoPauloParts(new Date()).dateKey;
  const rangeStart = saoPauloDateTimeToUtc(days[0], 0, 0);
  const rangeEnd = saoPauloDateTimeToUtc(days[6], 23, 59);

  const prisma = getPrisma();
  const [meetingsRaw, oauthAccounts, allUsers, companies] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        tenantId: ctx.tenantId,
        startAt: { gte: rangeStart, lte: rangeEnd },
        OR: [{ createdByUserId: ctx.userId }, { attendees: { some: { userId: ctx.userId } } }],
      },
      orderBy: { startAt: "asc" },
      include: {
        attendees: { include: { user: { select: { id: true, name: true } } } },
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.oAuthAccount.findMany({ where: { tenantId: ctx.tenantId, userId: ctx.userId }, select: { provider: true } }),
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const hasGoogle = oauthAccounts.some((a) => a.provider === "GOOGLE");
  const hasMicrosoft = oauthAccounts.some((a) => a.provider === "MICROSOFT");

  const meetings = meetingsRaw.map((m) => ({
    id: m.id,
    provider: m.provider,
    title: m.title,
    meetingUrl: m.meetingUrl,
    startAt: m.startAt.toISOString(),
    endAt: m.endAt.toISOString(),
    attendees: m.attendees.map((a) => ({ id: a.user.id, name: a.user.name })),
    company: m.company ? { id: m.company.id, name: m.company.name } : null,
    clientName: m.clientName,
  }));

  const weekDays = days.map((dateKey) => ({ dateKey, isToday: dateKey === todayKey }));

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">Agenda</h1>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
          Suas reuniões da semana — clique num horário vazio para agendar direto por aqui.
        </p>
      </div>

      <WeekCalendar
        weekDays={weekDays}
        meetings={meetings}
        monthYearLabel={monthYearLabel(mondayKey)}
        prevHref={`/agenda?week=${addDaysToKey(mondayKey, -7)}`}
        nextHref={`/agenda?week=${addDaysToKey(mondayKey, 7)}`}
        todayHref="/agenda"
        createAction={criarReuniaoAvulsa}
        deleteAction={excluirReuniaoAvulsa}
        hasGoogle={hasGoogle}
        hasMicrosoft={hasMicrosoft}
        allUsers={allUsers}
        companies={companies}
      />
    </PageContainer>
  );
}
