"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { calendarDays, calendarLevel, dateLabel } from "@/lib/github/calendar";
const LEVELS = ["bg-surface-2", "bg-success/20", "bg-success/40", "bg-success/70", "bg-success"];
type Props = { from: string; to: string; days: { day: string; count: number }[]; complete: boolean; onDay: (userId: string, day: string) => void; label: string; userId: string };
export const ContributionCalendar = memo(function ContributionCalendar(props: Props) {
  const container = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(false), [focused, setFocused] = useState(false);
  const restoreFocus = useRef(false), scrollLeftRef = useRef(0), mounted = visible || focused;
  useEffect(() => {
    if (!container.current) return;
    // A montagem adiada sozinha acumulava os 7.320 botões depois de uma rolagem.
    // Mantém apenas a área próxima da viewport e o calendário com foco de teclado.
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: "300px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (mounted && restoreFocus.current) {
      restoreFocus.current = false;
      container.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
    }
  }, [mounted]);
  return <div ref={container} style={{ minHeight: 140 }} role="group" aria-label={`Calendário de ${props.label}`}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    {mounted ? <CalendarGrid key={`${props.from}:${props.to}`} {...props} scrollLeftRef={scrollLeftRef} />
      : <div tabIndex={0} aria-label={`Exibir calendário de ${props.label}`} className="h-32 rounded bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
        onFocus={() => { restoreFocus.current = true; setFocused(true); }} />}
  </div>;
}, (previous, next) => previous.from === next.from && previous.to === next.to && previous.complete === next.complete && previous.label === next.label
  && previous.userId === next.userId && previous.onDay === next.onDay && previous.days.length === next.days.length
  && previous.days.every((day, index) => day.day === next.days[index].day && day.count === next.days[index].count));

function CalendarGrid({ from, to, days, complete, onDay, userId, scrollLeftRef }: Props & { scrollLeftRef: { current: number } }) {
  const cells = useMemo(() => calendarDays(from, to), [from, to]);
  const counts = useMemo(() => new Map(days.map(day => [day.day, day.count])), [days]), buttons = useRef(new Map<string, HTMLButtonElement>());
  const focused = useRef(from), scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scrollLeftRef.current; }, [scrollLeftRef]);
  return <div ref={scroller} className="overflow-x-auto pb-2" onScroll={event => { scrollLeftRef.current = event.currentTarget.scrollLeft; }}>
    <div className="grid w-max gap-[3px]" style={{ gridTemplateRows: "repeat(7, 13px)", gridAutoFlow: "column", gridAutoColumns: "13px" }}>
      {cells.map((day, index) => {
        if (!day) return <span key={`empty-${index}`} aria-hidden="true" />;
        const count = counts.get(day) ?? 0, unknown = count === 0 && !complete;
        const title = `${dateLabel(day)}: ${unknown ? "coleta incompleta" : `${count} ${count === 1 ? "contribuição" : "contribuições"}`}`;
        return <button key={day} type="button" ref={element => { if (element) buttons.current.set(day, element); else buttons.current.delete(day); }}
          tabIndex={from === day ? 0 : -1} aria-label={title} title={title} data-level={calendarLevel(count)}
          className={`size-[13px] rounded-[3px] border border-border/40 outline-none hover:ring-2 hover:ring-brand focus-visible:ring-2 focus-visible:ring-brand ${LEVELS[calendarLevel(count)]}`}
          style={unknown ? { backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 2px, var(--c41-border) 2px, var(--c41-border) 3px)" } : undefined}
          onFocus={event => { const previous = buttons.current.get(focused.current); if (previous) previous.tabIndex = -1; focused.current = day; event.currentTarget.tabIndex = 0; }} onClick={() => onDay(userId, day)} onKeyDown={event => {
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
    <div className="mt-2 flex min-w-max items-center justify-between gap-6 text-micro text-fg-muted"><span>{dateLabel(from)} — {dateLabel(to)}</span>
      <span className="flex items-center gap-1.5">Menos {LEVELS.map((level, index) => <span key={index} aria-hidden="true" className={`inline-block size-2.5 rounded-sm ${level}`} />)} Mais{!complete && " · listrado: não confirmado"}</span>
    </div>
  </div>;
}
