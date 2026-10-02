import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getPrisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { getMeetingIntegrationHealth } from "@/lib/integrations/health";
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
import { prazosDoPeriodo } from "@/lib/prazosDaAgenda";
import { getSectorMaps } from "@/lib/sectors";

const VIEW_HELPER: Record<string, string> = {
  dia: "Os prazos e as reuniões do dia — clique num horário vazio para agendar.",
  semana: "Os prazos dos seus setores e as suas reuniões da semana.",
  mes: "O mês inteiro de relance — clique no dia para abrir a visão de dia.",
};
const VIEW_HELPER_SEM_REUNIAO: Record<string, string> = {
  dia: "Os prazos do dia nos seus setores: vencimentos, prazos combinados, férias e exames.",
  semana: "Os prazos da semana nos seus setores: vencimentos, prazos combinados, férias e exames.",
  mes: "Os prazos do mês nos seus setores — clique no dia para ver tudo dele.",
};

// Agenda interativa em três visões (dia, semana e mês).
//
// 30/09: deixou de ser só de reuniões (e só de coordenadores). O Kauan pediu
// para ver se ela servia aos outros setores; serve — agora ela mostra os
// prazos de cada setor que a pessoa enxerga (`prazosDoPeriodo`), e reunião
// continua sendo criada só por coordenador e administrador. Visão e data de
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
  const podeAgendar = canManageMeetings(ctx);

  const view = parseAgendaView(viewRaw);
  const dateKey = parseAgendaDate(dateRaw);
  const days = agendaDayKeys(view, dateKey);
  const todayKey = saoPauloParts(new Date()).dateKey;
  const rangeStart = saoPauloDateTimeToUtc(days[0], 0, 0);
  const rangeEnd = saoPauloDateTimeToUtc(days[days.length - 1], 23, 59);

  const prisma = getPrisma();
  const [meetingsRaw, oauthAccounts, allUsers, companies, prazos, { labels, colors }] = await Promise.all([
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
    // Conta conectada, pessoas e empresas só servem para criar reunião.
    podeAgendar
      ? prisma.oAuthAccount.findMany({ where: { tenantId: ctx.tenantId, userId: ctx.userId }, select: { provider: true } })
      : Promise.resolve([]),
    podeAgendar
      ? prisma.user.findMany({
          where: { tenantId: ctx.tenantId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    podeAgendar
      ? prisma.company.findMany({
          where: { tenantId: ctx.tenantId, status: "ACTIVE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, logoUrl: true, cnpj: true, parentCompanyId: true },
        })
      : Promise.resolve([]),
    prazosDoPeriodo(ctx, days[0], days[days.length - 1]),
    getSectorMaps(ctx.tenantId),
  ]);
  const setores = Object.fromEntries(Object.keys(labels).map((code) => [code, { rotulo: labels[code], cor: colors[code] ?? "#586577" }]));
  // A legenda só com os setores que têm prazo à vista.
  const setoresComPrazo = Array.from(new Set(prazos.map((p) => p.setor))).filter((code) => setores[code]);

  const hasGoogle = oauthAccounts.some((a) => a.provider === "GOOGLE");
  const hasMicrosoft = oauthAccounts.some((a) => a.provider === "MICROSOFT");

  // Aviso de conta vencida: sem isto o usuário só descobria ao tentar criar a
  // reunião e receber o erro. Só custa rede quando o token já está vencendo.
  const [googleHealth, microsoftHealth] = await Promise.all([
    hasGoogle ? getMeetingIntegrationHealth(ctx.tenantId, ctx.userId, "GOOGLE") : Promise.resolve("NOT_CONNECTED" as const),
    hasMicrosoft
      ? getMeetingIntegrationHealth(ctx.tenantId, ctx.userId, "MICROSOFT")
      : Promise.resolve("NOT_CONNECTED" as const),
  ]);
  const contasVencidas = [
    googleHealth === "NEEDS_RECONNECT" ? "Google" : null,
    microsoftHealth === "NEEDS_RECONNECT" ? "Microsoft" : null,
  ].filter((v): v is string => v !== null);

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
        <PageHeader title="Agenda" subtitle={(podeAgendar ? VIEW_HELPER : VIEW_HELPER_SEM_REUNIAO)[view]} />
        {setoresComPrazo.length > 0 && (
          <ul className="mb-3 -mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-secondary" aria-label="Setores dos prazos">
            {setoresComPrazo.map((code) => (
              <li key={code} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px]" style={{ background: setores[code].cor }} aria-hidden />
                {setores[code].rotulo}
              </li>
            ))}
          </ul>
        )}

        {contasVencidas.length > 0 && (
          // "Reconectar agora" era link sublinhado no fim da frase (30/09): é a
          // ação do aviso, então é botão, à direita dele.
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[length:var(--fs-helper)] text-danger bg-danger-bg border border-danger/30 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <p className="flex-1 min-w-[16rem]">
              Sua conta {contasVencidas.join(" e ")} expirou — reuniões novas não vão gerar link até
              você reconectar.
            </p>
            <Button href="/admin/integracoes" variant="danger" size="xs">
              <RefreshCw size={11} /> Reconectar agora
            </Button>
          </div>
        )}
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
          prazos={prazos}
          setores={setores}
          podeAgendar={podeAgendar}
        />
      </div>
    </PageContainer>
  );
}
