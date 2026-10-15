"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { saoPauloParts, addDaysToKey, mondayOfWeek, type AgendaView } from "@/lib/agenda";
import { IconButton } from "@/components/ui/IconButton";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";

type Props = {
  /** Visão ativa — o mini navega mantendo-a e destaca o período correspondente. */
  view: AgendaView;
  /** Dias exibidos na grade grande (1, 7 ou 42) — ficam destacados no mini. */
  selectedKeys: string[];
  /** Data de referência da grade grande, usada pra abrir o mini no mês certo. */
  referenceKey: string;
};

const MONTH_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAY_INITIALS = ["S", "T", "Q", "Q", "S", "S", "D"]; // seg → dom

function keyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Mini-calendário mensal pra pular direto pra qualquer data sem depender das
// setinhas — abre como popover a partir de um botão no cabeçalho, então não
// ocupa espaço nem muda o layout da grade.
export function MiniCalendar({ view, selectedKeys, referenceKey }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ancoraRef = useRef<HTMLSpanElement>(null);

  const [initYear, initMonth] = referenceKey.split("-").map(Number);
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

  // O clique fora é do `PainelFlutuante`; o Esc fica aqui, marcado como usado
  // (como no Popover), para não fechar junto quem está embaixo.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const todayKey = saoPauloParts(new Date()).dateKey;
  // No mês a grade grande cobre as 6 semanas inteiras — destacar tudo isso no
  // mini só pintaria o calendário inteiro, então lá o destaque some.
  const highlightKeys = useMemo(
    () => (view === "mes" ? new Set<string>() : new Set(selectedKeys)),
    [view, selectedKeys]
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
    router.push(`/agenda?view=${view}&date=${dateKey}`);
  }

  // O painel é o `PainelFlutuante` (15/10/2026), e não um `absolute` escrito à
  // mão: vai por cima de tudo e, no celular, vira a folha embaixo. O gatilho e
  // as setas do mês são o `IconButton`.
  return (
    <>
      <span ref={ancoraRef} className="inline-flex">
        <IconButton
          size="sm"
          onClick={toggleOpen}
          aria-label="Escolher data no calendário"
          aria-expanded={open}
          title="Escolher data"
          className={open ? "bg-surface-hover text-fg!" : undefined}
        >
          <CalendarDays size={15} />
        </IconButton>
      </span>

      <PainelFlutuante
        ancora={ancoraRef}
        aberto={open}
        onFechar={() => setOpen(false)}
        largura={248}
        folhaNoCelular
        aria-label="Escolher data"
        className="p-3"
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-fs-2 font-semibold text-fg">
            {MONTH_LABEL[viewMonth - 1]} de {viewYear}
          </p>
          <div className="flex items-center gap-0.5">
            <IconButton size="sm" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
              <ChevronLeft size={13} />
            </IconButton>
            <IconButton size="sm" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
              <ChevronRight size={13} />
            </IconButton>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-0.5">
          {WEEKDAY_INITIALS.map((w, i) => (
            <span key={i} className="text-center text-micro font-medium text-fg-muted uppercase py-0.5">
              {w}
            </span>
          ))}
          {gridDays.map((dateKey) => {
            const [, m, d] = dateKey.split("-").map(Number);
            const inMonth = m === viewMonth;
            const isToday = dateKey === todayKey;
            const highlighted = highlightKeys.has(dateKey);
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => pick(dateKey)}
                className={`h-7 rounded-md text-micro tnum transition-colors ${
                  isToday
                    ? "bg-brand-solid text-on-brand font-semibold"
                    : highlighted
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
      </PainelFlutuante>
    </>
  );
}
