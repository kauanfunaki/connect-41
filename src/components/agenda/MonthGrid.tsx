"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MeetingItem } from "./MeetingItem";
import { PrazoItem, type SetoresDaAgenda } from "./PrazoItem";
import type { PrazoDaAgenda } from "@/lib/prazosDaAgenda";
import { saoPauloParts, weekdayLabel, dayNumber, isSameMonth } from "@/lib/agenda";
import type { CalendarDay, MeetingActions, MeetingRow } from "./types";
import { etiquetasQueCabem } from "./etiquetasNaCelula";

const WEEKDAY_HEADER = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Cor de reserva do prazo sem setor: a de Gestão, pelo token (era o hex cru). */
const COR_SEM_SETOR = "var(--c41-sector-gestao)";

type Props = {
  days: CalendarDay[]; // 42 dias (6 semanas), começando numa segunda-feira
  meetings: MeetingRow[];
  actions: MeetingActions;
  /** Mês de referência — dias fora dele aparecem esmaecidos. */
  monthKey: string;
  /** Sem permissão de agendar, o "+" da célula some. */
  onDayClick?: (dateKey: string) => void;
  prazos: PrazoDaAgenda[];
  setores: SetoresDaAgenda;
};

// Visão mensal: sem eixo de horas, cada dia é uma célula com as reuniões em
// ordem cronológica. No celular as 7 colunas não comportam texto, então as
// reuniões viram bolinhas coloridas e o dia inteiro leva pra visão de dia.
export function MonthGrid({ days, meetings, actions, monthKey, onDayClick, prazos, setores }: Props) {
  const prazosByDay = useMemo(() => {
    const map = new Map<string, PrazoDaAgenda[]>();
    for (const p of prazos) map.set(p.dia, [...(map.get(p.dia) ?? []), p]);
    return map;
  }, [prazos]);

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

  // A altura de uma célula (as 6 semanas dividem a grade), medida: quantas
  // etiquetas cabem depende dela, e não de um teto fixo — ver
  // `etiquetasQueCabem`. No celular as etiquetas viram bolinhas e a conta não vale.
  const gradeRef = useRef<HTMLDivElement>(null);
  const [alturaDaCelula, setAlturaDaCelula] = useState<number | null>(null);
  useEffect(() => {
    const grade = gradeRef.current;
    if (!grade) return;
    // O observador já avisa uma vez ao começar a observar: é a primeira medida.
    const observador = new ResizeObserver(() => setAlturaDaCelula(grade.clientHeight / 6));
    observador.observe(grade);
    return () => observador.disconnect();
  }, []);

  return (
    // Mesma regra da grade de horas: as 6 semanas dividem a altura disponível
    // em vez de somarem alturas mínimas fixas, senão o mês estoura a viewport e
    // devolve a rolagem à página. No celular a altura mínima continua valendo —
    // 6 linhas de 1fr numa tela de 700px dariam células sem uso.
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-border flex-shrink-0">
        {WEEKDAY_HEADER.map((label) => (
          <div key={label} className="text-center py-2 border-l border-border first:border-l-0">
            <p className="text-[length:var(--fs-micro)] font-medium text-fg-muted uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      <div ref={gradeRef} className="grid grid-cols-7 flex-1 min-h-0 sm:grid-rows-6">
        {days.map((d) => {
          const dayMeetings = meetingsByDay.get(d.dateKey) ?? [];
          const dayPrazos = prazosByDay.get(d.dateKey) ?? [];
          const outside = !isSameMonth(d.dateKey, monthKey);
          // Prazos primeiro (são do dia inteiro), reuniões depois; o teto de
          // etiquetas vale para os dois juntos.
          const cabem = etiquetasQueCabem(alturaDaCelula, dayPrazos.length + dayMeetings.length);
          const prazosNaCelula = dayPrazos.slice(0, cabem);
          const reunioesNaCelula = dayMeetings.slice(0, Math.max(cabem - prazosNaCelula.length, 0));
          const overflow = dayPrazos.length + dayMeetings.length - prazosNaCelula.length - reunioesNaCelula.length;

          return (
            <div
              key={d.dateKey}
              className={`group relative border-l border-t border-border [&:nth-child(7n+1)]:border-l-0 min-h-[66px] sm:min-h-0 sm:overflow-hidden p-1 sm:p-1.5 ${
                outside ? "bg-surface-hover/40" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <Link
                  href={`/agenda?view=dia&date=${d.dateKey}`}
                  title={`Ver ${weekdayLabel(d.dateKey)}, dia ${dayNumber(d.dateKey)}`}
                  className={`w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center rounded-full text-[length:var(--fs-micro)] sm:text-[length:var(--fs-2)] tnum transition-colors ${
                    d.isToday
                      ? "bg-brand-solid text-on-brand font-semibold"
                      : outside
                        ? "text-fg-muted/60 hover:bg-surface-hover"
                        : "text-fg hover:bg-surface-hover"
                  }`}
                >
                  {dayNumber(d.dateKey)}
                </Link>
                {onDayClick && <button
                  type="button"
                  onClick={() => onDayClick(d.dateKey)}
                  aria-label={`Criar reunião em ${d.dateKey}`}
                  className="hidden sm:inline-flex w-5 h-5 items-center justify-center rounded text-fg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-hover transition-opacity text-[length:var(--fs-label)] leading-none"
                >
                  +
                </button>}
              </div>

              {/* Telas médias pra cima: reuniões como chips clicáveis. */}
              <div className="hidden sm:block space-y-0.5">
                {prazosNaCelula.map((p) => (
                  <PrazoItem key={p.chave} prazo={p} setores={setores} />
                ))}
                {reunioesNaCelula.map((m) => (
                  <MeetingItem key={m.id} meeting={m} actions={actions} variant="chip" />
                ))}
                {overflow > 0 && (
                  <Link
                    href={`/agenda?view=dia&date=${d.dateKey}`}
                    className="block px-1 text-[length:var(--fs-micro)] font-medium text-fg-muted hover:text-brand transition-colors"
                  >
                    +{overflow} mais
                  </Link>
                )}
              </div>

              {/* Celular: só a densidade do dia, em bolinhas — texto não cabe. */}
              {dayMeetings.length + dayPrazos.length > 0 && (
                <Link
                  href={`/agenda?view=dia&date=${d.dateKey}`}
                  aria-label={`${dayMeetings.length + dayPrazos.length} compromisso(s) em ${d.dateKey}`}
                  className="sm:hidden flex items-center gap-0.5 flex-wrap px-0.5"
                >
                  {dayPrazos.slice(0, 3).map((p) => (
                    <span key={p.chave} className="w-1.5 h-1.5 rounded-[2px]" style={{ background: setores[p.setor]?.cor ?? COR_SEM_SETOR }} />
                  ))}
                  {dayMeetings.slice(0, 4).map((m) => (
                    <span
                      key={m.id}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: m.provider === "GOOGLE" ? "var(--c41-brand)" : "#7C5CBF" }}
                    />
                  ))}
                  {dayMeetings.length > 4 && <span className="text-[length:var(--fs-micro)] text-fg-muted tnum">+{dayMeetings.length - 4}</span>}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
