"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { CreateMeetingDialog } from "./CreateMeetingDialog";
import { MiniCalendar } from "./MiniCalendar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TimeGrid } from "./TimeGrid";
import { MonthGrid } from "./MonthGrid";
import { saoPauloParts, shiftAgendaDate, agendaTitle, type AgendaView } from "@/lib/agenda";
import { slotNoDia, slotParaNovaReuniao, type Expediente, type Slot } from "@/lib/agendaExpediente";
import type { MeetingState } from "@/app/(app)/agenda/actions";
import type { CalendarDay, CompanyOption, MeetingActions, MeetingRow, UserOption } from "./types";
import type { SetoresDaAgenda } from "./PrazoItem";
import type { PrazoDaAgenda } from "@/lib/prazosDaAgenda";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

const VIEW_LABEL: Record<AgendaView, string> = { dia: "Dia", semana: "Semana", mes: "Mês" };
const VIEW_ORDER: AgendaView[] = ["dia", "semana", "mes"];

const PREV_LABEL: Record<AgendaView, string> = {
  dia: "Dia anterior",
  semana: "Semana anterior",
  mes: "Mês anterior",
};
const NEXT_LABEL: Record<AgendaView, string> = {
  dia: "Próximo dia",
  semana: "Próxima semana",
  mes: "Próximo mês",
};

type Props = {
  /** O cabeçalho da tela — desenhado aqui para o "Nova reunião" ficar nas
   *  ações dele, ao lado do título (escolha 5A, 08/10/2026). */
  titulo: string;
  subtitulo: React.ReactNode;
  /** O que vem entre o cabeçalho e a grade: a legenda dos setores e avisos. */
  antesDaGrade?: React.ReactNode;
  view: AgendaView;
  /** Data de referência da visão (dia exibido / dia dentro da semana / mês). */
  dateKey: string;
  days: CalendarDay[];
  meetings: MeetingRow[];
  createAction: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  editAction: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  deleteAction: (meetingId: string) => Promise<void>;
  hasGoogle: boolean;
  hasMicrosoft: boolean;
  allUsers: UserOption[];
  companies: CompanyOption[];
  currentUserId: string;
  /** Prazos do período — de todos os setores que a pessoa enxerga. */
  prazos: PrazoDaAgenda[];
  setores: SetoresDaAgenda;
  /** Coordenador ou administrador: só eles criam reunião (ver canManageMeetings). */
  podeAgendar: boolean;
  /** Horário da grade de dia/semana — o da pessoa ou o do escritório. */
  expediente: Expediente;
};

export function agendaHref(view: AgendaView, dateKey: string): string {
  return `/agenda?view=${view}&date=${dateKey}`;
}

// Casca da Agenda: cabeçalho (título, navegação, seletor de visão) + a grade
// da visão ativa. Dia e semana usam a mesma grade de horas (TimeGrid); mês tem
// grade própria. A visão vive na URL, não em estado local, pra que voltar/
// avançar no navegador e links diretos ("+2 mais" → dia) funcionem.
export function AgendaCalendar({
  titulo,
  subtitulo,
  antesDaGrade,
  view,
  dateKey,
  days,
  meetings,
  createAction,
  editAction,
  deleteAction,
  hasGoogle,
  hasMicrosoft,
  allUsers,
  companies,
  currentUserId,
  prazos,
  setores,
  podeAgendar,
  expediente,
}: Props) {
  const [dialogSlot, setDialogSlot] = useState<Slot | null>(null);

  const actions: MeetingActions = { editAction, deleteAction, allUsers, companies, currentUserId };
  const todayKey = saoPauloParts(new Date()).dateKey;

  // Botão "Nova reunião": cai na próxima hora cheia de hoje quando hoje está à
  // vista; senão, no primeiro dia exibido. Desde 05/10 a hora é puxada para o
  // expediente, que pode passar da meia-noite — a regra está em
  // slotParaNovaReuniao.
  function openDialogForNow() {
    setDialogSlot(slotParaNovaReuniao(expediente, days.map((d) => d.dateKey), new Date()));
  }

  return (
    <>
      <div className="flex-shrink-0">
        <PageHeader
          title={titulo}
          subtitle={subtitulo}
          action={
            podeAgendar && (
              <Button variant="primary" onClick={openDialogForNow}>
                <Plus size={14} /> Nova reunião
              </Button>
            )
          }
        />
        {antesDaGrade}
      </div>
      <div className="flex-1 min-h-0">
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden h-full flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap flex-shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-section font-semibold text-fg">{agendaTitle(view, dateKey)}</h2>
              <div className="flex items-center gap-1">
                <Link
                  href={agendaHref(view, shiftAgendaDate(view, dateKey, -1))}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
                  aria-label={PREV_LABEL[view]}
                >
                  <ChevronLeft size={15} />
                </Link>
                {/* Era texto com fundo no hover (30/09): "Hoje" é ação, com borda de botão. */}
                <Button href={agendaHref(view, todayKey)} variant="secondary" size="xs">
                  Hoje
                </Button>
                <Link
                  href={agendaHref(view, shiftAgendaDate(view, dateKey, 1))}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
                  aria-label={NEXT_LABEL[view]}
                >
                  <ChevronRight size={15} />
                </Link>
                <MiniCalendar view={view} selectedKeys={days.map((d) => d.dateKey)} referenceKey={dateKey} />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <SegmentedControl
                label="Visão da agenda"
                active={view}
                items={VIEW_ORDER.map((v) => ({
                  key: v,
                  label: VIEW_LABEL[v],
                  href: agendaHref(v, dateKey),
                }))}
              />
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {view === "mes" ? (
              <MonthGrid
                days={days}
                meetings={meetings}
                actions={actions}
                monthKey={dateKey}
                onDayClick={podeAgendar ? (day) => setDialogSlot(slotNoDia(expediente, day, new Date())) : undefined}
                prazos={prazos}
                setores={setores}
              />
            ) : (
              <TimeGrid
                days={days}
                meetings={meetings}
                actions={actions}
                onSlotClick={podeAgendar ? setDialogSlot : undefined}
                prazos={prazos}
                setores={setores}
                expediente={expediente}
              />
            )}
          </div>

          {dialogSlot && (
            <CreateMeetingDialog
              action={createAction}
              initialStart={dialogSlot.start}
              initialEnd={dialogSlot.end}
              hasGoogle={hasGoogle}
              hasMicrosoft={hasMicrosoft}
              allUsers={allUsers}
              companies={companies}
              onClose={() => setDialogSlot(null)}
            />
          )}
        </div>
      </div>
    </>
  );
}
