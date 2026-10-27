"use client";

import { memo, useMemo, useRef, type CSSProperties } from "react";
import { calendarDays, calendarLevel, dateLabel } from "@/lib/github/calendar";
import styles from "./GithubContributions.module.css";

type Props = { from: string; to: string; days: { day: string; count: number }[]; onDay: (id: string, day: string) => void; label: string; id: string };
const position = (index: number): CSSProperties => ({ gridColumn: Math.floor(index / 7) + 1, gridRow: index % 7 + 1 });

// Calendário leve (27/10/2026). Os ~370 dias vazios eram um elemento cada (com
// pseudo-elemento do traço) e a montagem por IntersectionObserver refazia milhares de
// nós a cada cartão que entrava ou saía na rolagem: era isso que travava a aba
// Desenvolvedores. Agora o fundo da grade desenha todos os dias vazios de uma vez
// (máscara repetida em CSS) e só os dias com contribuição viram elemento — botão,
// posicionado na grade. As pontas fora do período ganham uma caixa que esconde o fundo.
export const ContributionCalendar = memo(function ContributionCalendar({ from, to, days, onDay, label, id }: Props) {
  const cells = useMemo(() => calendarDays(from, to), [from, to]);
  const counts = useMemo(() => new Map(days.map(day => [day.day, day.count])), [days]);
  // As setas andam entre os dias com contribuição: cima/baixo pelo anterior/próximo, esquerda/direita pela semana.
  const active = useMemo(() => cells.flatMap((day, index) => day && counts.get(day) ? [index] : []), [cells, counts]);
  const blanks = useMemo(() => cells.flatMap((day, index) => day ? [] : [index]), [cells]);
  const grid = useRef<HTMLDivElement>(null), focused = useRef<number | null>(null);
  const button = (index: number) => grid.current?.querySelector<HTMLButtonElement>(`button[data-index="${index}"]`);
  // 3 px de respiro: a rolagem lateral recortava o anel de destaque da primeira linha (27/10/2026).
  return <div className="overflow-x-auto p-[3px] pb-2" role="group" aria-label={`Calendário de ${label}`}>
    <div ref={grid} className={styles.calendar} style={{ "--weeks": cells.length / 7 } as CSSProperties}
      onClick={event => { const day = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-day]")?.dataset.day; if (day) onDay(id, day); }}
      onFocus={event => {
        const index = Number((event.target as HTMLElement).dataset.index); if (!Number.isInteger(index)) return;
        const previous = focused.current === null ? null : button(focused.current); if (previous) previous.tabIndex = -1;
        focused.current = index; event.target.tabIndex = 0;
      }}
      onKeyDown={event => {
        const index = Number((event.target as HTMLElement).dataset.index); if (!Number.isInteger(index)) return;
        const at = active.indexOf(index); let target: number | undefined;
        if (event.key === "ArrowUp") target = active[at - 1];
        else if (event.key === "ArrowDown") target = active[at + 1];
        else if (event.key === "ArrowLeft") target = active.findLast(cell => cell <= index - 7);
        else if (event.key === "ArrowRight") target = active.find(cell => cell >= index + 7);
        else if (event.key === "Home") target = active[0];
        else if (event.key === "End") target = active.at(-1);
        else return;
        event.preventDefault(); if (target !== undefined) button(target)?.focus();
      }}>
      {blanks.map(index => <span key={`blank-${index}`} aria-hidden="true" className={styles.blank} style={position(index)} />)}
      {active.map(index => {
        const day = cells[index]!, count = counts.get(day)!, title = `${dateLabel(day)}: ${count} ${count === 1 ? "contribuição" : "contribuições"}`;
        return <button key={day} type="button" data-index={index} data-day={day} tabIndex={index === active[0] ? 0 : -1} aria-label={title} title={title}
          data-level={calendarLevel(count)} className={styles.day} style={position(index)} />;
      })}
    </div>
    <div className="mt-2 flex min-w-max items-center justify-between gap-6 text-micro text-fg-muted"><span>{dateLabel(from)} — {dateLabel(to)}</span>
      <span className="flex items-center gap-1.5">Menos {[0, 1, 2, 3, 4].map(level => <span key={level} aria-hidden="true" data-level={level} className={styles.legendCell} />)} Mais</span>
    </div>
  </div>;
});
