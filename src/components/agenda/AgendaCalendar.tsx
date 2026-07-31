"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { CreateMeetingDialog } from "./CreateMeetingDialog";
import { MiniCalendar } from "./MiniCalendar";
import { TimeGrid, slotRange, defaultSlotHour } from "./TimeGrid";
import { MonthGrid } from "./MonthGrid";
import { saoPauloParts, shiftAgendaDate, agendaTitle, type AgendaView } from "@/lib/agenda";
import type { MeetingState } from "@/app/(app)/agenda/actions";
import type { CalendarDay, CompanyOption, MeetingActions, MeetingRow, UserOption } from "./types";

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
};

export function agendaHref(view: AgendaView, dateKey: string): string {
  return `/agenda?view=${view}&date=${dateKey}`;
}

// Casca da Agenda: cabeçalho (título, navegação, seletor de visão) + a grade
// da visão ativa. Dia e semana usam a mesma grade de horas (TimeGrid); mês tem
// grade própria. A visão vive na URL, não em estado local, pra que voltar/
// avançar no navegador e links diretos ("+2 mais" → dia) funcionem.
export function AgendaCalendar({
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
}: Props) {
  const [dialogSlot, setDialogSlot] = useState<{ start: string; end: string } | null>(null);

  const actions: MeetingActions = { editAction, deleteAction, allUsers, companies, currentUserId };
  const todayKey = saoPauloParts(new Date()).dateKey;

  function openDialogFor(day: string, hour: number) {
    setDialogSlot(slotRange(day, hour));
  }

  // Botão "Nova reunião": cai na próxima hora cheia de hoje quando hoje está à
  // vista; senão, no primeiro dia exibido (uma reunião criada de dentro de
  // outubro não deve nascer em setembro).
  function openDialogForNow() {
    const visibleToday = days.find((d) => d.isToday);
    openDialogFor(visibleToday?.dateKey ?? days[0].dateKey, defaultSlotHour());
  }

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg">{agendaTitle(view, dateKey)}</h2>
          <div className="flex items-center gap-1">
            <Link
              href={agendaHref(view, shiftAgendaDate(view, dateKey, -1))}
              className="w-7 h-7 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
              aria-label={PREV_LABEL[view]}
            >
              <ChevronLeft size={15} />
            </Link>
            <Link
              href={agendaHref(view, todayKey)}
              className="h-7 px-2.5 flex items-center rounded-md text-[12.5px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
            >
              Hoje
            </Link>
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
          <div role="tablist" aria-label="Visão da agenda" className="inline-flex rounded-lg border border-border overflow-hidden">
            {VIEW_ORDER.map((v) => (
              <Link
                key={v}
                role="tab"
                aria-selected={v === view}
                href={agendaHref(v, dateKey)}
                className={`h-8 px-3 flex items-center text-[12px] font-medium border-l border-border first:border-l-0 transition-colors ${
                  v === view ? "bg-surface-hover text-fg" : "text-fg-muted hover:text-fg"
                }`}
              >
                {VIEW_LABEL[v]}
              </Link>
            ))}
          </div>

          <button
            type="button"
            onClick={openDialogForNow}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            <Plus size={14} />
            Nova reunião
          </button>
        </div>
      </div>

      {view === "mes" ? (
        <MonthGrid
          days={days}
          meetings={meetings}
          actions={actions}
          monthKey={dateKey}
          onDayClick={(day) => openDialogFor(day, defaultSlotHour())}
        />
      ) : (
        <TimeGrid days={days} meetings={meetings} actions={actions} onSlotClick={openDialogFor} />
      )}

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
  );
}
