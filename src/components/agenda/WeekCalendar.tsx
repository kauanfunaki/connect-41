"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, ExternalLink, Pencil } from "lucide-react";
import { CreateMeetingDialog } from "./CreateMeetingDialog";
import { EditMeetingDialog } from "./EditMeetingDialog";
import { MiniCalendar } from "./MiniCalendar";
import { CopyLinkButton } from "@/components/shared/CopyLinkButton";
import { saoPauloParts, weekdayLabel, dayNumber, toSaoPauloDateTimeLocal } from "@/lib/agenda";
import { formatInstantTime } from "@/lib/format";
import type { MeetingState } from "@/app/(app)/agenda/actions";
import type { MeetingProvider } from "@/generated/prisma/enums";

const START_HOUR = 7;
const END_HOUR = 21; // exclusivo — última linha é 20:00–21:00
const ROW_HEIGHT = 48;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const TOTAL_MIN = (END_HOUR - START_HOUR) * 60;

const PROVIDER_LABEL: Record<MeetingProvider, string> = { GOOGLE: "Google Meet", MICROSOFT: "MS Teams" };

type MeetingRow = {
  id: string;
  provider: MeetingProvider;
  title: string;
  meetingUrl: string;
  startAt: string; // ISO
  endAt: string; // ISO
  attendees: { id: string; name: string }[];
  // externalId = "ID" manual da empresa (referência do Acessórias) — é como o
  // time identifica a empresa no dia a dia, então aparece junto do nome.
  company: { id: string; name: string; externalId: string | null } | null;
  clientName: string | null;
  createdByUserId: string;
};

type WeekDay = { dateKey: string; isToday: boolean };
type UserOption = { id: string; name: string };
type CompanyOption = { id: string; name: string };

type Props = {
  weekDays: WeekDay[];
  meetings: MeetingRow[];
  monthYearLabel: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  createAction: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  editAction: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  deleteAction: (meetingId: string) => Promise<void>;
  hasGoogle: boolean;
  hasMicrosoft: boolean;
  allUsers: UserOption[];
  companies: CompanyOption[];
  currentUserId: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(d: Date): string {
  return formatInstantTime(d, { hour: "2-digit", minute: "2-digit" });
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function WeekCalendar({
  weekDays,
  meetings,
  monthYearLabel,
  prevHref,
  nextHref,
  todayHref,
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

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, (MeetingRow & { top: number; height: number })[]>();
    for (const m of meetings) {
      const start = new Date(m.startAt);
      const end = new Date(m.endAt);
      const sp = saoPauloParts(start);
      const ep = saoPauloParts(end);
      const startMin = clamp((sp.hour - START_HOUR) * 60 + sp.minute, 0, TOTAL_MIN);
      const rawEndMin = ep.dateKey === sp.dateKey ? (ep.hour - START_HOUR) * 60 + ep.minute : TOTAL_MIN;
      const endMin = clamp(rawEndMin, startMin + 15, TOTAL_MIN);
      const top = (startMin / 60) * ROW_HEIGHT;
      const height = Math.max(22, ((endMin - startMin) / 60) * ROW_HEIGHT - 2);
      const list = map.get(sp.dateKey) ?? [];
      list.push({ ...m, top, height });
      map.set(sp.dateKey, list);
    }
    return map;
  }, [meetings]);

  function openDialogFor(dateKey: string, hour: number) {
    setDialogSlot({ start: `${dateKey}T${pad(hour)}:00`, end: `${dateKey}T${pad(hour + 1)}:00` });
  }

  function openDialogForNow() {
    const todayKey = weekDays.find((d) => d.isToday)?.dateKey ?? weekDays[0].dateKey;
    const now = saoPauloParts(new Date());
    const hour = clamp(now.hour + 1, START_HOUR, END_HOUR - 1);
    openDialogFor(todayKey, hour);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg">{monthYearLabel}</h2>
          <div className="flex items-center gap-1">
            <Link
              href={prevHref}
              className="w-7 h-7 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
              aria-label="Semana anterior"
            >
              <ChevronLeft size={15} />
            </Link>
            <Link
              href={todayHref}
              className="h-7 px-2.5 flex items-center rounded-md text-[12.5px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
            >
              Hoje
            </Link>
            <Link
              href={nextHref}
              className="w-7 h-7 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
              aria-label="Próxima semana"
            >
              <ChevronRight size={15} />
            </Link>
            <MiniCalendar currentWeekMonday={weekDays[0].dateKey} />
          </div>
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

      <div className="overflow-x-auto">
        <div style={{ minWidth: 780 }}>
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border">
            <div />
            {weekDays.map((d) => (
              <div
                key={d.dateKey}
                className={`text-center py-2.5 border-l border-border ${d.isToday ? "bg-brand-subtle" : ""}`}
              >
                <p className="text-[10.5px] font-medium text-fg-muted uppercase tracking-wide">{weekdayLabel(d.dateKey)}</p>
                <p className={`text-[15px] font-semibold tnum ${d.isToday ? "text-brand" : "text-fg"}`}>{dayNumber(d.dateKey)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[56px_repeat(7,1fr)]">
            <div>
              {HOURS.map((h) => (
                <div key={h} style={{ height: ROW_HEIGHT }} className="relative">
                  <span className="absolute -top-2 right-2 text-[10.5px] text-fg-muted tnum">{h}:00</span>
                </div>
              ))}
            </div>

            {weekDays.map((d) => (
              <div key={d.dateKey} className="relative border-l border-border">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => openDialogFor(d.dateKey, h)}
                    style={{ height: ROW_HEIGHT }}
                    className="w-full border-b border-border/60 hover:bg-surface-hover transition-colors block"
                    aria-label={`Criar reunião ${weekdayLabel(d.dateKey)} ${dayNumber(d.dateKey)} às ${h}:00`}
                  />
                ))}

                {d.isToday && <NowIndicator />}

                {(meetingsByDay.get(d.dateKey) ?? []).map((m) => (
                  <MeetingBlock
                    key={m.id}
                    meeting={m}
                    top={m.top}
                    height={m.height}
                    editAction={editAction}
                    deleteAction={deleteAction}
                    allUsers={allUsers}
                    companies={companies}
                    currentUserId={currentUserId}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
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
  );
}

// Linha vermelha com bolinha marcando o horário atual, no espírito do Google
// Agenda — só aparece na coluna de hoje e dentro da janela de horas visível.
// Recalcula a cada 30s (client-side; sem refetch de servidor).
function NowIndicator() {
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    function update() {
      const sp = saoPauloParts(new Date());
      const min = (sp.hour - START_HOUR) * 60 + sp.minute;
      if (min < 0 || min > TOTAL_MIN) {
        setTop(null);
        return;
      }
      setTop((min / 60) * ROW_HEIGHT);
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  if (top === null) return null;

  return (
    <div
      style={{ position: "absolute", top, left: 0, right: 0 }}
      className="z-20 flex items-center pointer-events-none"
      aria-hidden="true"
    >
      <span className="w-2 h-2 rounded-full bg-danger -ml-1 flex-shrink-0" />
      <div className="flex-1 h-px bg-danger" />
    </div>
  );
}

function MeetingBlock({
  meeting,
  top,
  height,
  editAction,
  deleteAction,
  allUsers,
  companies,
  currentUserId,
}: {
  meeting: MeetingRow;
  top: number;
  height: number;
  editAction: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  deleteAction: (meetingId: string) => Promise<void>;
  allUsers: UserOption[];
  companies: CompanyOption[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canEdit = meeting.createdByUserId === currentUserId;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const start = new Date(meeting.startAt);
  const end = new Date(meeting.endAt);
  const isGoogle = meeting.provider === "GOOGLE";
  const blockStyle = isGoogle
    ? undefined
    : { background: "rgba(124,92,191,0.16)", borderLeft: "2.5px solid #7C5CBF" };
  const textStyle = isGoogle ? undefined : { color: "#7C5CBF" };

  return (
    // Com o popover (ou o modal de edição) aberto o bloco sobe acima do
    // marcador de horário atual (z-20) — senão a linha vermelha atravessa por
    // cima das informações da reunião.
    <div ref={rootRef} style={{ position: "absolute", top, height, left: 2, right: 2 }} className={open || editing ? "z-30" : "z-10"}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={blockStyle}
        className={`w-full h-full rounded-md pl-1.5 pr-1 py-1 text-left overflow-hidden block ${
          isGoogle ? "bg-brand-subtle border-l-[2.5px] border-brand" : ""
        }`}
      >
        <p className="text-[11px] font-medium truncate leading-tight" style={textStyle ?? { color: "var(--c41-brand)" }}>
          {meeting.title}
        </p>
        {height > 30 && (
          <p className="text-[10px] text-fg-muted truncate leading-tight">
            {meeting.company ? meeting.company.name : formatTime(start)}
          </p>
        )}
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 w-64 bg-surface-elevated border border-border-strong rounded-xl shadow-[var(--c41-shadow-lg)] p-3 space-y-2">
          <p className="text-[13px] font-medium text-fg">{meeting.title}</p>
          <p className="text-[12px] text-fg-muted">
            {formatTime(start)}–{formatTime(end)} · {PROVIDER_LABEL[meeting.provider]}
          </p>
          {meeting.company && (
            <p className="text-[12px] text-fg-secondary">
              Empresa:{" "}
              <span className="text-fg">
                {meeting.company.name}
                {meeting.company.externalId && ` · ID ${meeting.company.externalId}`}
              </span>
            </p>
          )}
          {meeting.clientName && <p className="text-[12px] text-fg-secondary">Cliente(s): <span className="text-fg">{meeting.clientName}</span></p>}
          {meeting.attendees.length > 0 && (
            <p className="text-[12px] text-fg-secondary">Com {meeting.attendees.map((a) => a.name).join(", ")}</p>
          )}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <a
              href={meeting.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-brand hover:underline"
            >
              Entrar <ExternalLink size={12} />
            </a>
            <CopyLinkButton url={meeting.meetingUrl} />
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1 text-[12px] text-fg-secondary hover:text-fg transition-colors"
              >
                <Pencil size={11} /> Editar
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm("Excluir esta reunião?")) deleteAction(meeting.id);
              }}
              className="text-[12px] text-danger hover:underline ml-auto"
            >
              Excluir
            </button>
          </div>
        </div>
      )}

      {editing && (
        <EditMeetingDialog
          action={editAction}
          meeting={{
            id: meeting.id,
            provider: meeting.provider,
            title: meeting.title,
            startAtLocal: toSaoPauloDateTimeLocal(start),
            endAtLocal: toSaoPauloDateTimeLocal(end),
            companyId: meeting.company?.id ?? null,
            clientName: meeting.clientName,
            attendeeIds: meeting.attendees.map((a) => a.id),
          }}
          allUsers={allUsers}
          companies={companies}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
