"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { saoPauloParts, addDaysToKey, mondayOfWeek } from "@/lib/agenda";

type Props = {
  // Segunda-feira da semana exibida na grade grande — marca a semana atual no mini.
  currentWeekMonday: string;
};

const MONTH_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAY_INITIALS = ["S", "T", "Q", "Q", "S", "S", "D"]; // seg → dom

function keyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Mini-calendário mensal pra pular direto pra qualquer semana sem depender das
// setinhas — abre como popover a partir de um botão no cabeçalho, então não
// ocupa espaço nem muda o layout da grade semanal.
export function MiniCalendar({ currentWeekMonday }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const [initYear, initMonth] = currentWeekMonday.split("-").map(Number);
  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth); // 1–12

  // Reabrir sempre olhando pro mês da semana exibida na grade.
  function toggleOpen() {
    if (!open) {
      setViewYear(initYear);
      setViewMonth(initMonth);
    }
    setOpen(!open);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const todayKey = saoPauloParts(new Date()).dateKey;
  const currentWeekKeys = useMemo(
    () => new Set(Array.from({ length: 7 }, (_, i) => addDaysToKey(currentWeekMonday, i))),
    [currentWeekMonday]
  );

  // 6 semanas fixas a partir da segunda-feira que contém o dia 1º do mês —
  // altura estável, sem "pulos" ao navegar entre meses.
  const gridDays = useMemo(() => {
    const firstMonday = mondayOfWeek(keyOf(viewYear, viewMonth, 1));
    return Array.from({ length: 42 }, (_, i) => addDaysToKey(firstMonday, i));
  }, [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  function pick(dateKey: string) {
    setOpen(false);
    router.push(`/agenda?week=${mondayOfWeek(dateKey)}`);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Escolher semana no calendário"
        title="Escolher semana"
        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
          open ? "text-fg bg-surface-hover" : "text-fg-muted hover:text-fg hover:bg-surface-hover"
        }`}
      >
        <CalendarDays size={15} />
      </button>

      {open && (
        <div className="absolute z-40 top-full left-0 mt-1.5 w-[248px] bg-surface-elevated border border-border-strong rounded-xl shadow-[var(--c41-shadow-lg)] p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12.5px] font-semibold text-fg">
              {MONTH_LABEL[viewMonth - 1]} de {viewYear}
            </p>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Mês anterior"
                className="w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Próximo mês"
                className="w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {WEEKDAY_INITIALS.map((w, i) => (
              <span key={i} className="text-center text-[10px] font-medium text-fg-muted uppercase py-0.5">
                {w}
              </span>
            ))}
            {gridDays.map((dateKey) => {
              const [, m, d] = dateKey.split("-").map(Number);
              const inMonth = m === viewMonth;
              const isToday = dateKey === todayKey;
              const inCurrentWeek = currentWeekKeys.has(dateKey);
              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => pick(dateKey)}
                  className={`h-7 rounded-md text-[11.5px] tnum transition-colors ${
                    isToday
                      ? "bg-brand text-on-brand font-semibold"
                      : inCurrentWeek
                        ? "bg-brand-subtle text-brand font-medium hover:bg-brand/15"
                        : inMonth
                          ? "text-fg hover:bg-surface-hover"
                          : "text-fg-muted/60 hover:bg-surface-hover"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
