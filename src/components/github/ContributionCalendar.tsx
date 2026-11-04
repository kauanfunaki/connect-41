"use client";

import { memo, useMemo, useRef, type CSSProperties } from "react";
import { calendarDays, calendarLevel, dateLabel } from "@/lib/github/calendar";
import { corDoDia, quemContribuiu, type ModoDeCor, type Paleta, type ParteDoDia } from "@/lib/github/cores";
import type { CalendarDay } from "@/lib/github/types";
import styles from "./GithubContributions.module.css";

// `paleta` e `modo` pintam cada dia com a cor de quem contribuiu nele (04/11/2026).
// `pessoa` é o calendário de uma pessoa só (aba Desenvolvedores): os dias vêm sem
// partes e ficam todos com a cor dela.
type Props = { from: string; to: string; days: CalendarDay[]; onDay: (id: string, day: string) => void; label: string; id: string;
  paleta?: Paleta; modo?: ModoDeCor; pessoa?: string };
const LEGENDA_MAXIMA = 8;
const position = (index: number): CSSProperties => ({ gridColumn: Math.floor(index / 7) + 1, gridRow: index % 7 + 1 });

// Calendário leve (27/10/2026). Os ~370 dias vazios eram um elemento cada (com
// pseudo-elemento do traço) e a montagem por IntersectionObserver refazia milhares de
// nós a cada cartão que entrava ou saía na rolagem: era isso que travava a aba
// Desenvolvedores. Agora o fundo da grade desenha todos os dias vazios de uma vez
// (máscara repetida em CSS) e só os dias com contribuição viram elemento — botão,
// posicionado na grade. As pontas fora do período ganham uma caixa que esconde o fundo.
export const ContributionCalendar = memo(function ContributionCalendar({ from, to, days, onDay, label, id, paleta, modo = "pessoa", pessoa }: Props) {
  const cells = useMemo(() => calendarDays(from, to), [from, to]);
  const counts = useMemo(() => new Map(days.map(day => [day.day, day.count])), [days]);
  // A cor e o "quem" de cada dia, e a legenda com todos os que aparecem no período.
  const { tons, legenda } = useMemo(() => {
    const tons = new Map<string, { cor: string; quem: string }>();
    if (!paleta) return { tons, legenda: [] };
    const todas: ParteDoDia[] = [];
    for (const day of days) {
      const partes: ParteDoDia[] | undefined = day.parts ?? (pessoa ? [[pessoa, day.count]] : undefined);
      if (!partes?.length) continue;
      todas.push(...partes);
      tons.set(day.day, { cor: corDoDia(partes, paleta, modo), quem: quemContribuiu(partes, paleta, modo).map(grupo => `${grupo.rotulo} (${grupo.total})`).join(", ") });
    }
    return { tons, legenda: pessoa && modo === "pessoa" ? [] : quemContribuiu(todas, paleta, modo) };
  }, [days, paleta, modo, pessoa]);
  // As setas andam entre os dias com contribuição: cima/baixo pelo anterior/próximo, esquerda/direita pela semana.
  const active = useMemo(() => cells.flatMap((day, index) => day && counts.get(day) ? [index] : []), [cells, counts]);
  const blanks = useMemo(() => cells.flatMap((day, index) => day ? [] : [index]), [cells]);
  // A escala "Menos → Mais" só fala de quantidade: na cor da pessoa, num calendário de uma
  // pessoa só; neutra quando as cores variam de um dia para outro.
  const escala = !paleta ? undefined : pessoa ? tons.values().next().value?.cor : "var(--c41-fg-muted)";
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
        const day = cells[index]!, count = counts.get(day)!, tom = tons.get(day);
        const title = `${dateLabel(day)}: ${count} ${count === 1 ? "contribuição" : "contribuições"}${tom?.quem ? ` — ${tom.quem}` : ""}`;
        return <button key={day} type="button" data-index={index} data-day={day} tabIndex={index === active[0] ? 0 : -1} aria-label={title} title={title}
          data-level={calendarLevel(count)} className={styles.day} style={{ ...position(index), ...(tom ? { "--day-color": tom.cor } : {}) } as CSSProperties} />;
      })}
    </div>
    <div className="mt-2 flex min-w-max items-center justify-between gap-6 text-micro text-fg-muted"><span>{dateLabel(from)} — {dateLabel(to)}</span>
      <span className="flex items-center gap-1.5">Menos {[0, 1, 2, 3, 4].map(level => <span key={level} aria-hidden="true" data-level={level} className={styles.legendCell}
        style={escala ? { "--day-color": escala } as CSSProperties : undefined} />)} Mais</span>
    </div>
    {legenda.length > 1 && <ul className={`${styles.swatches} mt-2 text-micro text-fg-muted`} aria-label={modo === "time" ? "Times no calendário" : "Pessoas no calendário"}>
      {legenda.slice(0, LEGENDA_MAXIMA).map(grupo => <li key={grupo.chave} className={styles.swatch} style={{ "--swatch": grupo.cor } as CSSProperties}>{grupo.rotulo}</li>)}
      {legenda.length > LEGENDA_MAXIMA && <li>+{legenda.length - LEGENDA_MAXIMA}</li>}
    </ul>}
  </div>;
});
