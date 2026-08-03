import { getPrisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { PageContainer } from "@/components/shared/PageContainer";
import { AgendaCalendar } from "@/components/agenda/AgendaCalendar";
import { criarReuniaoAvulsa, editarReuniaoAvulsa, excluirReuniaoAvulsa } from "./actions";
import {
  saoPauloParts,
  saoPauloDateTimeToUtc,
  agendaDayKeys,
  parseAgendaView,
  parseAgendaDate,
} from "@/lib/agenda";
import { redirect } from "next/navigation";

const VIEW_HELPER: Record<string, string> = {
  dia: "As reuniões do dia — clique num horário vazio para agendar direto por aqui.",
  semana: "Suas reuniões da semana — clique num horário vazio para agendar direto por aqui.",
  mes: "O mês inteiro de relance — clique num dia para agendar ou abrir a visão de dia.",
};

// Agenda interativa em três visões (dia, semana e mês). Visão e data de
// referência vivem na URL (?view=&date=), então link direto, voltar/avançar do
// navegador e o "+N mais" da visão mensal funcionam sem estado de cliente.
// Reunião pode ser criada direto por aqui (clique num horário/dia vazio ou
// botão "Nova reunião"), sem passar por um item de Kanban primeiro:
// Meeting.pipelineItemId já é opcional no schema.
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { view: viewRaw, date: dateRaw } = await searchParams;
  const ctx = await getAuthContext();
  if (!canManageMeetings(ctx)) redirect("/home");

  const view = parseAgendaView(viewRaw);
  const dateKey = parseAgendaDate(dateRaw);
  const days = agendaDayKeys(view, dateKey);
  const todayKey = saoPauloParts(new Date()).dateKey;
  const rangeStart = saoPauloDateTimeToUtc(days[0], 0, 0);
  const rangeEnd = saoPauloDateTimeToUtc(days[days.length - 1], 23, 59);

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
        company: { select: { id: true, name: true, externalId: true } },
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
    company: m.company ? { id: m.company.id, name: m.company.name, externalId: m.company.externalId } : null,
    clientName: m.clientName,
    createdByUserId: m.createdByUserId,
  }));

  const calendarDays = days.map((key) => ({ dateKey: key, isToday: key === todayKey }));

  return (
    // A Agenda é uma tela de relance: o calendário se ajusta à altura que sobra
    // em vez de a página rolar. Mesmo arranjo de /kanban/[id] e /bpo-manual.
    <PageContainer className="h-full flex flex-col">
      <div className="flex-shrink-0">
        <PageHeader title="Agenda" subtitle={VIEW_HELPER[view]} />
      </div>

      <div className="flex-1 min-h-0">
        <AgendaCalendar
          view={view}
          dateKey={dateKey}
          days={calendarDays}
          meetings={meetings}
          createAction={criarReuniaoAvulsa}
          editAction={editarReuniaoAvulsa}
          deleteAction={excluirReuniaoAvulsa}
          hasGoogle={hasGoogle}
          hasMicrosoft={hasMicrosoft}
          allUsers={allUsers}
          companies={companies}
          currentUserId={ctx.userId}
        />
      </div>
    </PageContainer>
  );
}
