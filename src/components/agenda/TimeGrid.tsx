"use client";

import { useEffect, useMemo, useState } from "react";
import { MeetingItem } from "./MeetingItem";
import { saoPauloParts, weekdayLabel, dayNumber } from "@/lib/agenda";
import type { CalendarDay, MeetingActions, MeetingRow } from "./types";

const START_HOUR = 7;
const END_HOUR = 21; // exclusivo — última linha é 20:00–21:00
// A grade não tem mais altura de linha fixa: as 14 horas dividem em partes
// iguais o espaço que sobra da viewport (`1fr` cada). Com pixel fixo, qualquer
// tela mais baixa que a soma das linhas empurrava a página inteira pra rolagem
// — e a Agenda é uma tela de relance, não de rolar. Como consequência, posição
// e altura de reunião viram percentual do eixo, não pixel.
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const TOTAL_MIN = (END_HOUR - START_HOUR) * 60;
const ROWS_TEMPLATE = `repeat(${HOURS.length}, minmax(0, 1fr))`;
// Abaixo disso a reunião não comporta título + segunda linha.
const COMPACT_UNDER_MIN = 45;

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
    const map = new Map<string, (MeetingRow & { top: string; height: string; compact: boolean })[]>();
    for (const m of meetings) {
      const start = new Date(m.startAt);
      const end = new Date(m.endAt);
      const sp = saoPauloParts(start);
      const ep = saoPauloParts(end);
      const startMin = clamp((sp.hour - START_HOUR) * 60 + sp.minute, 0, TOTAL_MIN);
      const rawEndMin = ep.dateKey === sp.dateKey ? (ep.hour - START_HOUR) * 60 + ep.minute : TOTAL_MIN;
      const endMin = clamp(rawEndMin, startMin + 15, TOTAL_MIN);
      const durationMin = endMin - startMin;
      const list = map.get(sp.dateKey) ?? [];
      list.push({
        ...m,
        top: `${(startMin / TOTAL_MIN) * 100}%`,
        height: `${(durationMin / TOTAL_MIN) * 100}%`,
        compact: durationMin < COMPACT_UNDER_MIN,
      });
      map.set(sp.dateKey, list);
    }
    return map;
  }, [meetings]);

  const gridTemplate = `56px repeat(${days.length}, 1fr)`;
  // Na visão de dia a coluna única já cabe no celular; na semana as 7 colunas
  // continuam pedindo rolagem horizontal em telas estreitas.
  const minWidth = days.length === 1 ? 280 : 780;

  return (
    <div className="overflow-x-auto h-full">
      <div style={{ minWidth }} className="h-full flex flex-col">
        <div className="grid border-b border-border flex-shrink-0" style={{ gridTemplateColumns: gridTemplate }}>
          {/* O rótulo da primeira hora mora AQUI, no cabeçalho, e não na coluna
              de horas: como todo rótulo se centra na linha que abre a sua hora,
              a linha do 7:00 é justamente esta borda inferior do cabeçalho.
              Renderizado na coluna de horas ele precisaria vazar 8px pra cima,
              onde o `overflow-x-auto` do container recorta. */}
          <div className="relative">
            <span className="absolute right-2 bottom-0 translate-y-1/2 text-[length:var(--fs-micro)] text-fg-muted tnum leading-none">
              {START_HOUR}:00
            </span>
          </div>
          {days.map((d) => (
            <div
              key={d.dateKey}
              className={`text-center py-2.5 border-l border-border ${d.isToday ? "bg-brand-subtle" : ""}`}
            >
              <p className="text-[length:var(--fs-micro)] font-medium text-fg-muted uppercase tracking-wide">{weekdayLabel(d.dateKey)}</p>
              <p className={`text-[15px] font-semibold tnum ${d.isToday ? "text-brand" : "text-fg"}`}>{dayNumber(d.dateKey)}</p>
            </div>
          ))}
        </div>

        <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: gridTemplate }}>
          {/* Cada rótulo se centra na linha que abre a sua hora. O da primeira
              hora saiu daqui pro cabeçalho — ver comentário acima.

              `top-0 -translate-y-1/2` centra de verdade, seja qual for a
              altura da linha do texto. O `-top-2` de antes era um chute de
              -8px: com o rótulo em ~13px de altura, o certo seriam ~6,5px, e
              a sobra deixava estes rótulos um pouco acima da linha — perto do
              7:00, que agora está centrado exatamente, a diferença aparecia. */}
          <div className="grid" style={{ gridTemplateRows: ROWS_TEMPLATE }}>
            {HOURS.map((h, i) => (
              <div key={h} className="relative">
                {i > 0 && (
                  <span className="absolute right-2 top-0 -translate-y-1/2 text-[length:var(--fs-micro)] text-fg-muted tnum leading-none">
                    {h}:00
                  </span>
                )}
              </div>
            ))}
          </div>

          {days.map((d) => (
            <div key={d.dateKey} className="relative border-l border-border grid" style={{ gridTemplateRows: ROWS_TEMPLATE }}>
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onSlotClick(d.dateKey, h)}
                  className="w-full border-b border-border/60 hover:bg-surface-hover transition-colors block last:border-b-0"
                  aria-label={`Criar reunião ${weekdayLabel(d.dateKey)} ${dayNumber(d.dateKey)} às ${h}:00`}
                />
              ))}

              {d.isToday && <NowIndicator />}

              {(meetingsByDay.get(d.dateKey) ?? []).map((m) => (
                <MeetingItem
                  key={m.id}
                  meeting={m}
                  actions={actions}
                  variant="block"
                  top={m.top}
                  height={m.height}
                  compact={m.compact}
                />
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
  const [top, setTop] = useState<string | null>(null);

  useEffect(() => {
    function update() {
      const sp = saoPauloParts(new Date());
      const min = (sp.hour - START_HOUR) * 60 + sp.minute;
      if (min < 0 || min > TOTAL_MIN) {
        setTop(null);
        return;
      }
      setTop(`${(min / TOTAL_MIN) * 100}%`);
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
