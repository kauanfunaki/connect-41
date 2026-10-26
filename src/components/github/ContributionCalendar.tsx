"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { calendarDays, calendarLevel, dateLabel } from "@/lib/github/calendar";
import styles from "./GithubContributions.module.css";
const LEVELS = ["bg-surface-2", "bg-success/20", "bg-success/40", "bg-success/70", "bg-success"];
type Props = { from: string; to: string; days: { day: string; count: number }[]; onDay: (userId: string, day: string) => void; label: string; userId: string };
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
      : <div tabIndex={props.days.length ? 0 : -1} aria-label={`Exibir calendário de ${props.label}`} className="h-32 rounded bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
        onFocus={() => { restoreFocus.current = true; setFocused(true); }} />}
  </div>;
}, (previous, next) => previous.from === next.from && previous.to === next.to && previous.label === next.label
  && previous.userId === next.userId && previous.onDay === next.onDay && previous.days.length === next.days.length
  && previous.days.every((day, index) => day.day === next.days[index].day && day.count === next.days[index].count));

function CalendarGrid({ from, to, days, onDay, userId, scrollLeftRef }: Props & { scrollLeftRef: { current: number } }) {
  const cells = useMemo(() => calendarDays(from, to), [from, to]);
  const counts = useMemo(() => new Map(days.map(day => [day.day, day.count])), [days]);
  // Só os dias com contribuição viram botão; o detalhe é consultado no clique (26/10/2026).
  // As setas andam entre esses dias: cima/baixo pelo anterior/próximo, esquerda/direita pela semana.
  const active = useMemo(() => cells.flatMap((day, index) => day && counts.get(day) ? [index] : []), [cells, counts]);
  const grid = useRef<HTMLDivElement>(null), focused = useRef<number | null>(null), scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scrollLeftRef.current; }, [scrollLeftRef]);
  const button = (index: number) => grid.current?.querySelector<HTMLButtonElement>(`button[data-index="${index}"]`);
  return <div ref={scroller} className="overflow-x-auto pb-2" onScroll={event => { scrollLeftRef.current = event.currentTarget.scrollLeft; }}>
    <div ref={grid} className="grid w-max gap-[3px]" style={{ gridTemplateRows: "repeat(7, 13px)", gridAutoFlow: "column", gridAutoColumns: "13px" }}
      onClick={event => { const day = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-day]")?.dataset.day; if (day) onDay(userId, day); }}
      onFocus={event => {
        const index = Number((event.target as HTMLElement).dataset.index); if (!Number.isInteger(index)) return;
        const previous = focused.current === null ? null : button(focused.current); if (previous) previous.tabIndex = -1;
        focused.current = index; event.target.tabIndex = 0;
      }}
      onKeyDown={event => {
        const index = Number((event.target as HTMLElement).dataset.index); if (!Number.isInteger(index)) return;
        const position = active.indexOf(index); let target: number | undefined;
        if (event.key === "ArrowUp") target = active[position - 1];
        else if (event.key === "ArrowDown") target = active[position + 1];
        else if (event.key === "ArrowLeft") target = active.findLast(cell => cell <= index - 7);
        else if (event.key === "ArrowRight") target = active.find(cell => cell >= index + 7);
        else if (event.key === "Home") target = active[0];
        else if (event.key === "End") target = active.at(-1);
        else return;
        event.preventDefault(); if (target !== undefined) button(target)?.focus();
      }}>
      {cells.map((day, index) => {
        if (!day) return <span key={`empty-${index}`} aria-hidden="true" />;
        const count = counts.get(day) ?? 0;
        if (!count) return <span key={day} aria-hidden="true" title={`${dateLabel(day)}: sem contribuições`} className={styles.emptyDay} />;
        const title = `${dateLabel(day)}: ${count} ${count === 1 ? "contribuição" : "contribuições"}`;
        return <button key={day} type="button" data-index={index} data-day={day} tabIndex={index === active[0] ? 0 : -1} aria-label={title} title={title} data-level={calendarLevel(count)}
          className={`size-[13px] rounded-[3px] border border-border/40 outline-none hover:ring-2 hover:ring-brand focus-visible:ring-2 focus-visible:ring-brand ${LEVELS[calendarLevel(count)]}`} />;
      })}
    </div>
    <div className="mt-2 flex min-w-max items-center justify-between gap-6 text-micro text-fg-muted"><span>{dateLabel(from)} — {dateLabel(to)}</span>
      <span className="flex items-center gap-1.5">Menos {LEVELS.map((level, index) => <span key={index} aria-hidden="true" className={`inline-block size-2.5 rounded-sm ${level}`} />)} Mais</span>
    </div>
  </div>;
}
