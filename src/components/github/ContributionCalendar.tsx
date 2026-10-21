"use client";

import { useRef, useState } from "react";
import { calendarDays, calendarLevel, dateLabel } from "@/lib/github/calendar";
const LEVELS = ["bg-surface-2", "bg-success/20", "bg-success/40", "bg-success/70", "bg-success"];
export function ContributionCalendar({ from, to, days, complete, onDay, label }: {
  from: string; to: string; days: { day: string; count: number }[]; complete: boolean; onDay: (day: string) => void; label: string;
}) {
  const cells = calendarDays(from, to), counts = new Map(days.map(day => [day.day, day.count])), buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focused, setFocused] = useState(from);
  return <div className="overflow-x-auto pb-2" role="group" aria-label={`Calendário de ${label}`}>
    <div className="grid w-max gap-[3px]" style={{ gridTemplateRows: "repeat(7, 13px)", gridAutoFlow: "column", gridAutoColumns: "13px" }}>
      {cells.map((day, index) => {
        if (!day) return <span key={`empty-${index}`} aria-hidden="true" />;
        const count = counts.get(day) ?? 0, unknown = count === 0 && !complete;
        const title = `${dateLabel(day)}: ${unknown ? "coleta incompleta" : `${count} ${count === 1 ? "contribuição" : "contribuições"}`}`;
        return <button key={day} type="button" ref={element => { if (element) buttons.current.set(day, element); else buttons.current.delete(day); }}
          tabIndex={focused === day ? 0 : -1} aria-label={title} title={title} data-level={calendarLevel(count)}
          className={`size-[13px] rounded-[3px] border border-border/40 outline-none hover:ring-2 hover:ring-brand focus-visible:ring-2 focus-visible:ring-brand ${LEVELS[calendarLevel(count)]}`}
          style={unknown ? { backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 2px, var(--c41-border) 2px, var(--c41-border) 3px)" } : undefined}
          onFocus={() => setFocused(day)} onClick={() => onDay(day)} onKeyDown={event => {
            const delta: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
            let target: string | null | undefined;
            if (event.key in delta) target = cells[index + delta[event.key]];
            else if (event.key === "Home") target = from;
            else if (event.key === "End") target = to;
            else return;
            event.preventDefault(); if (target) buttons.current.get(target)?.focus();
          }} />;
      })}
    </div>
    <div className="mt-2 flex min-w-max items-center justify-between gap-6 text-fs-1 text-fg-muted"><span>{dateLabel(from)} — {dateLabel(to)}</span>
      <span className="flex items-center gap-1.5">Menos {LEVELS.map((level, index) => <span key={index} aria-hidden="true" className={`inline-block size-2.5 rounded-sm ${level}`} />)} Mais{!complete && " · listrado: não confirmado"}</span>
    </div>
  </div>;
}
