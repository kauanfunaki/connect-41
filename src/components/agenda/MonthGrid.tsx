"use client";

import { useMemo } from "react";
import Link from "next/link";
import { MeetingItem } from "./MeetingItem";
import { saoPauloParts, weekdayLabel, dayNumber, isSameMonth } from "@/lib/agenda";
import type { CalendarDay, MeetingActions, MeetingRow } from "./types";

const WEEKDAY_HEADER = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// Quantas reuniões cabem numa célula antes do "+N" — acima disso a célula
// cresceria e quebraria a altura uniforme da grade.
const MAX_CHIPS = 3;

type Props = {
  days: CalendarDay[]; // 42 dias (6 semanas), começando numa segunda-feira
  meetings: MeetingRow[];
  actions: MeetingActions;
  /** Mês de referência — dias fora dele aparecem esmaecidos. */
  monthKey: string;
  onDayClick: (dateKey: string) => void;
};

// Visão mensal: sem eixo de horas, cada dia é uma célula com as reuniões em
// ordem cronológica. No celular as 7 colunas não comportam texto, então as
// reuniões viram bolinhas coloridas e o dia inteiro leva pra visão de dia.
export function MonthGrid({ days, meetings, actions, monthKey, onDayClick }: Props) {
  const meetingsByDay = useMemo(() => {
    const map = new Map<string, MeetingRow[]>();
    for (const m of meetings) {
      const key = saoPauloParts(new Date(m.startAt)).dateKey;
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return map;
  }, [meetings]);

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_HEADER.map((label) => (
          <div key={label} className="text-center py-2 border-l border-border first:border-l-0">
            <p className="text-[10.5px] font-medium text-fg-muted uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dayMeetings = meetingsByDay.get(d.dateKey) ?? [];
          const outside = !isSameMonth(d.dateKey, monthKey);
          const overflow = dayMeetings.length - MAX_CHIPS;

          return (
            <div
              key={d.dateKey}
              className={`group relative border-l border-t border-border [&:nth-child(7n+1)]:border-l-0 min-h-[66px] sm:min-h-[104px] p-1 sm:p-1.5 ${
                outside ? "bg-surface-hover/40" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <Link
                  href={`/agenda?view=dia&date=${d.dateKey}`}
                  title={`Ver ${weekdayLabel(d.dateKey)}, dia ${dayNumber(d.dateKey)}`}
                  className={`w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center rounded-full text-[11px] sm:text-[12px] tnum transition-colors ${
                    d.isToday
                      ? "bg-brand text-on-brand font-semibold"
                      : outside
                        ? "text-fg-muted/60 hover:bg-surface-hover"
                        : "text-fg hover:bg-surface-hover"
                  }`}
                >
                  {dayNumber(d.dateKey)}
                </Link>
                <button
                  type="button"
                  onClick={() => onDayClick(d.dateKey)}
                  aria-label={`Criar reunião em ${d.dateKey}`}
                  className="hidden sm:inline-flex w-5 h-5 items-center justify-center rounded text-fg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-hover transition-opacity text-[14px] leading-none"
                >
                  +
                </button>
              </div>

              {/* Telas médias pra cima: reuniões como chips clicáveis. */}
              <div className="hidden sm:block space-y-0.5">
                {dayMeetings.slice(0, MAX_CHIPS).map((m) => (
                  <MeetingItem key={m.id} meeting={m} actions={actions} variant="chip" />
                ))}
                {overflow > 0 && (
                  <Link
                    href={`/agenda?view=dia&date=${d.dateKey}`}
                    className="block px-1 text-[10.5px] font-medium text-fg-muted hover:text-brand transition-colors"
                  >
                    +{overflow} mais
                  </Link>
                )}
              </div>

              {/* Celular: só a densidade do dia, em bolinhas — texto não cabe. */}
              {dayMeetings.length > 0 && (
                <Link
                  href={`/agenda?view=dia&date=${d.dateKey}`}
                  aria-label={`${dayMeetings.length} reunião(ões) em ${d.dateKey}`}
                  className="sm:hidden flex items-center gap-0.5 flex-wrap px-0.5"
                >
                  {dayMeetings.slice(0, 4).map((m) => (
                    <span
                      key={m.id}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: m.provider === "GOOGLE" ? "var(--c41-brand)" : "#7C5CBF" }}
                    />
                  ))}
                  {dayMeetings.length > 4 && <span className="text-[9px] text-fg-muted tnum">+{dayMeetings.length - 4}</span>}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
