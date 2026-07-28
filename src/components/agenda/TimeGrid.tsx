"use client";

import { useEffect, useMemo, useState } from "react";
import { MeetingItem } from "./MeetingItem";
import { saoPauloParts, weekdayLabel, dayNumber } from "@/lib/agenda";
import type { CalendarDay, MeetingActions, MeetingRow } from "./types";

const START_HOUR = 7;
const END_HOUR = 21; // exclusivo — última linha é 20:00–21:00
// 48px sobrava tanto que a visão de semana (mesma grade da de dia) só cabia na
// tela rolando: o eixo inteiro (14h) passava da altura disponível assim que a
// barra de rolagem horizontal das 7 colunas aparecia. 40px devolve ~112px e a
// grade cabe sem rolar em qualquer viewport razoável, igual dia/mês.
const ROW_HEIGHT = 40;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const TOTAL_MIN = (END_HOUR - START_HOUR) * 60;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

type Props = {
  days: CalendarDay[];
  meetings: MeetingRow[];
  actions: MeetingActions;
  onSlotClick: (dateKey: string, hour: number) => void;
};

// Grade com eixo de horas — serve às visões de dia (1 coluna) e semana (7).
// A única diferença entre elas é quantos dias entram em `days`, então não
// existe um DayGrid separado: seria o mesmo componente com um número fixo.
export function TimeGrid({ days, meetings, actions, onSlotClick }: Props) {
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

  const gridTemplate = `56px repeat(${days.length}, 1fr)`;
  // Na visão de dia a coluna única já cabe no celular; na semana as 7 colunas
  // continuam pedindo rolagem horizontal em telas estreitas.
  const minWidth = days.length === 1 ? 280 : 780;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }}>
        <div className="grid border-b border-border" style={{ gridTemplateColumns: gridTemplate }}>
          <div />
          {days.map((d) => (
            <div
              key={d.dateKey}
              className={`text-center py-2.5 border-l border-border ${d.isToday ? "bg-brand-subtle" : ""}`}
            >
              <p className="text-[10.5px] font-medium text-fg-muted uppercase tracking-wide">{weekdayLabel(d.dateKey)}</p>
              <p className={`text-[15px] font-semibold tnum ${d.isToday ? "text-brand" : "text-fg"}`}>{dayNumber(d.dateKey)}</p>
            </div>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          <div>
            {/* Cada rótulo flutua centralizado sobre a linha que separa esta
                hora da anterior (-top-2) — funciona porque sempre há uma
                linha acima. A primeira hora (7:00) não tem linha acima: com
                o mesmo deslocamento, o rótulo vazava pra cima da grade,
                cruzando a borda do cabeçalho dos dias. */}
            {HOURS.map((h, i) => (
              <div key={h} style={{ height: ROW_HEIGHT }} className="relative">
                <span className={`absolute right-2 text-[10.5px] text-fg-muted tnum ${i === 0 ? "top-0.5" : "-top-2"}`}>
                  {h}:00
                </span>
              </div>
            ))}
          </div>

          {days.map((d) => (
            <div key={d.dateKey} className="relative border-l border-border">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onSlotClick(d.dateKey, h)}
                  style={{ height: ROW_HEIGHT }}
                  className="w-full border-b border-border/60 hover:bg-surface-hover transition-colors block"
                  aria-label={`Criar reunião ${weekdayLabel(d.dateKey)} ${dayNumber(d.dateKey)} às ${h}:00`}
                />
              ))}

              {d.isToday && <NowIndicator />}

              {(meetingsByDay.get(d.dateKey) ?? []).map((m) => (
                <MeetingItem key={m.id} meeting={m} actions={actions} variant="block" top={m.top} height={m.height} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function slotRange(dateKey: string, hour: number): { start: string; end: string } {
  return { start: `${dateKey}T${pad(hour)}:00`, end: `${dateKey}T${pad(hour + 1)}:00` };
}

export function defaultSlotHour(): number {
  const now = saoPauloParts(new Date());
  return clamp(now.hour + 1, START_HOUR, END_HOUR - 1);
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
