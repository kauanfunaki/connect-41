"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { MeetingItem } from "./MeetingItem";
import { PrazoItem, type SetoresDaAgenda } from "./PrazoItem";
import type { PrazoDaAgenda } from "@/lib/prazosDaAgenda";
import { addDaysToKey, weekdayLabel, dayNumber } from "@/lib/agenda";
import {
  colunaDoInstante,
  contarForaDoHorario,
  descreverExpediente,
  duracaoEmHoras,
  horasDaGrade,
  posicaoDaReuniao,
  rotuloDaHora,
  slotDaLinha,
  type Expediente,
  type Slot,
} from "@/lib/agendaExpediente";
import { Button } from "@/components/ui/Button";
import type { CalendarDay, MeetingActions, MeetingRow } from "./types";

// A grade não tem altura de linha fixa: as horas do expediente dividem em
// partes iguais o espaço que sobra da viewport (`1fr` cada). Com pixel fixo,
// qualquer tela mais baixa que a soma das linhas empurrava a página inteira pra
// rolagem — e a Agenda é uma tela de relance, não de rolar. Como consequência,
// posição e altura de reunião viram percentual do eixo, não pixel.
//
// Desde 05/10/2026 as horas vêm do expediente (src/lib/agendaExpediente.ts) —
// eram fixas, das 7h às 21h — e podem passar da meia-noite.

// Abaixo disso a reunião não comporta título + segunda linha: eram 45 minutos
// na grade de 14 horas. Como a altura da linha depende de quantas horas a grade
// tem, a régua virou proporção (05/10): numa grade de 24 horas, uma hora é
// mais baixa que 45 minutos eram antes.
const COMPACTA_ABAIXO_DA_FRACAO = 45 / (14 * 60);

/** O rótulo da primeira hora, centrado na linha de baixo de quem o contém — onde as horas começam. */
function RotuloDaPrimeiraHora({ hora }: { hora: number }) {
  return (
    <span className="absolute right-2 bottom-0 translate-y-1/2 text-[length:var(--fs-micro)] text-fg-muted tnum leading-none">
      {rotuloDaHora(hora)}
    </span>
  );
}

type Props = {
  days: CalendarDay[];
  meetings: MeetingRow[];
  actions: MeetingActions;
  /** Sem permissão de agendar, clicar num horário não faz nada. */
  onSlotClick?: (slot: Slot) => void;
  prazos: PrazoDaAgenda[];
  setores: SetoresDaAgenda;
  /** As horas que cada coluna cobre — o do escritório ou o da pessoa. */
  expediente: Expediente;
};

/** Quantos prazos a faixa de dia inteiro mostra por dia, na semana, antes do "+N". */
const PRAZOS_POR_DIA_NA_SEMANA = 3;

// Grade com eixo de horas — serve às visões de dia (1 coluna) e semana (7).
// A única diferença entre elas é quantos dias entram em `days`, então não
// existe um DayGrid separado: seria o mesmo componente com um número fixo.
export function TimeGrid({ days, meetings, actions, onSlotClick, prazos, setores, expediente }: Props) {
  const prazosByDay = useMemo(() => {
    const map = new Map<string, PrazoDaAgenda[]>();
    for (const p of prazos) map.set(p.dia, [...(map.get(p.dia) ?? []), p]);
    return map;
  }, [prazos]);
  const temPrazo = days.some((d) => prazosByDay.has(d.dateKey));
  const umDia = days.length === 1;

  const horas = horasDaGrade(expediente);
  const rowsTemplate = `repeat(${horas.length}, minmax(0, 1fr))`;

  // Cada reunião vai para a coluna em que começa — que, passando da
  // meia-noite, pode ser a do dia anterior ao do calendário.
  const meetingsByDay = useMemo(() => {
    const total = duracaoEmHoras(expediente) * 60;
    const map = new Map<string, (MeetingRow & { top: string; height: string; compact: boolean })[]>();
    for (const m of meetings) {
      const pos = posicaoDaReuniao(expediente, new Date(m.startAt), new Date(m.endAt));
      if (!pos) continue;
      const duracao = pos.fimMin - pos.inicioMin;
      const list = map.get(pos.dia) ?? [];
      list.push({
        ...m,
        top: `${(pos.inicioMin / total) * 100}%`,
        height: `${(duracao / total) * 100}%`,
        compact: duracao / total < COMPACTA_ABAIXO_DA_FRACAO,
      });
      map.set(pos.dia, list);
    }
    return map;
  }, [meetings, expediente]);

  // Antes, reunião fora das 7h–21h virava um risco no topo ou sumia (altura
  // zero) sem aviso. Com o horário configurável isso fica mais provável, então
  // a grade diz quantas ficaram de fora (05/10).
  const foraDoHorario = useMemo(
    () => contarForaDoHorario(expediente, days.map((d) => d.dateKey), meetings),
    [expediente, days, meetings],
  );

  const gridTemplate = `56px repeat(${days.length}, 1fr)`;
  // Na visão de dia a coluna única já cabe no celular; na semana as 7 colunas
  // continuam pedindo rolagem horizontal em telas estreitas.
  const minWidth = days.length === 1 ? 280 : 780;

  return (
    <div className="overflow-x-auto h-full">
      <div style={{ minWidth }} className="h-full flex flex-col">
        <div className="grid flex-shrink-0" style={{ gridTemplateColumns: gridTemplate }}>
          {/* O rótulo da primeira hora mora AQUI, no cabeçalho, e não na coluna
              de horas: como todo rótulo se centra na linha que abre a sua hora,
              a linha da primeira hora é justamente o fim do cabeçalho.
              Renderizado na coluna de horas ele precisaria vazar 8px pra cima,
              onde o `overflow-x-auto` do container recorta.

              O `border-b` fica em cada célula de dia, e não neste grid: no
              container ele atravessava também a coluna de horas e cortava o
              rótulo ao meio. Nenhum outro rótulo tem linha atrás — as
              separadoras de hora só existem dentro das colunas de dia.

              Com a faixa de prazos (05/10), a primeira hora começa embaixo
              dela, e o rótulo vai para lá: aqui ele colava no "Prazos". */}
          <div className="relative">
            {!temPrazo && <RotuloDaPrimeiraHora hora={expediente.inicio} />}
          </div>
          {days.map((d) => (
            <div
              key={d.dateKey}
              className={`text-center py-2.5 border-l border-b border-border ${d.isToday ? "bg-brand-subtle" : ""}`}
            >
              <p className="text-[length:var(--fs-micro)] font-medium text-fg-muted uppercase tracking-wide">{weekdayLabel(d.dateKey)}</p>
              <p className={`text-[15px] font-semibold tnum ${d.isToday ? "text-brand" : "text-fg"}`}>{dayNumber(d.dateKey)}</p>
            </div>
          ))}
        </div>

        {/* Prazos do dia (30/09): vencimentos, prazos combinados, férias,
            exames — tudo que é do dia inteiro, e não de uma hora. Seguem a
            data de calendário mesmo quando o expediente passa da meia-noite.
            "Prazos" no alto da faixa e o rótulo da primeira hora no pé dela,
            na linha onde as horas começam (revisão de 05/10: os dois saíam
            colados). A borda de baixo fica em cada dia, e não no grid, pelo
            mesmo motivo do cabeçalho: atravessaria a coluna de horas e
            cortaria o rótulo. */}
        {temPrazo && (
          <div className="grid flex-shrink-0" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="relative flex items-start justify-end pr-2 pt-1.5 min-h-9">
              <span className="text-[length:var(--fs-micro)] font-medium text-fg-secondary leading-none">Prazos</span>
              <RotuloDaPrimeiraHora hora={expediente.inicio} />
            </div>
            {days.map((d) => {
              const lista = prazosByDay.get(d.dateKey) ?? [];
              const visiveis = umDia ? lista : lista.slice(0, PRAZOS_POR_DIA_NA_SEMANA);
              const resto = lista.length - visiveis.length;
              return (
                <div
                  key={d.dateKey}
                  className={`border-l border-b border-border p-1 min-w-0 max-h-[104px] overflow-y-auto scroll-y ${umDia ? "flex flex-wrap gap-1 [&>*]:w-auto [&>*]:max-w-full" : "space-y-0.5"}`}
                >
                  {visiveis.map((p) => (
                    <PrazoItem key={p.chave} prazo={p} setores={setores} />
                  ))}
                  {resto > 0 && (
                    <a
                      href={`/agenda?view=dia&date=${d.dateKey}`}
                      className="block px-1 text-[length:var(--fs-micro)] font-medium text-fg-muted hover:text-brand transition-colors"
                    >
                      +{resto} mais
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: gridTemplate }}>
          {/* Cada rótulo se centra na linha que abre a sua hora. O da primeira
              hora saiu daqui pro cabeçalho — ver comentário acima.

              `top-0 -translate-y-1/2` centra de verdade, seja qual for a
              altura da linha do texto. O `-top-2` de antes era um chute de
              -8px: com o rótulo em ~13px de altura, o certo seriam ~6,5px, e
              a sobra deixava estes rótulos um pouco acima da linha — perto do
              primeiro, que agora está centrado exatamente, a diferença aparecia. */}
          <div className="grid" style={{ gridTemplateRows: rowsTemplate }}>
            {horas.map((h, i) => (
              <div key={h} className="relative">
                {i > 0 && (
                  <span className="absolute right-2 top-0 -translate-y-1/2 text-[length:var(--fs-micro)] text-fg-muted tnum leading-none">
                    {rotuloDaHora(h)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {days.map((d) => (
            <div key={d.dateKey} className="relative border-l border-border grid" style={{ gridTemplateRows: rowsTemplate }}>
              {horas.map((h, i) => {
                // A linha da meia-noite, quando o expediente passa dela, é
                // cheia: separa o dia da coluna do dia seguinte (05/10).
                const borda = horas[i + 1] === 0 ? "border-border" : "border-border/60";
                if (!onSlotClick) {
                  return <div key={h} className={`w-full border-b ${borda} last:border-b-0`} aria-hidden />;
                }
                // Depois da meia-noite, o horário é do dia seguinte ao da coluna.
                const diaDoHorario = expediente.inicio + i >= 24 ? addDaysToKey(d.dateKey, 1) : d.dateKey;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onSlotClick(slotDaLinha(expediente, d.dateKey, i))}
                    className={`w-full border-b ${borda} hover:bg-surface-hover transition-colors block last:border-b-0`}
                    aria-label={`Criar reunião ${weekdayLabel(diaDoHorario)} ${dayNumber(diaDoHorario)} às ${rotuloDaHora(h)}`}
                  />
                );
              })}

              <NowIndicator dia={d.dateKey} expediente={expediente} />

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

        {foraDoHorario > 0 && (
          <div className="flex-shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1.5 text-[length:var(--fs-helper)] text-fg-muted">
            <Clock size={13} className="flex-shrink-0" aria-hidden />
            <p className="flex-1 min-w-0">
              {foraDoHorario === 1 ? "1 reunião fora do horário exibido" : `${foraDoHorario} reuniões fora do horário exibido`}{" "}
              ({descreverExpediente(expediente)}).
            </p>
            {/* A visão de mês não tem eixo de horas: lá elas aparecem. */}
            <Button href={`/agenda?view=mes&date=${days[0].dateKey}`} variant="secondary" size="xs">
              Ver no mês
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Linha vermelha com bolinha marcando o horário atual, no espírito do Google
// Agenda — só aparece na coluna em que o agora cai (passando da meia-noite, a
// madrugada é da coluna de ontem) e dentro do horário. Recalcula a cada 30s
// (client-side; sem refetch de servidor).
function NowIndicator({ dia, expediente }: { dia: string; expediente: Expediente }) {
  const [top, setTop] = useState<string | null>(null);
  const { inicio, fim } = expediente;

  useEffect(() => {
    function update() {
      const e = { inicio, fim };
      const coluna = colunaDoInstante(e, new Date());
      if (!coluna || coluna.dia !== dia) {
        setTop(null);
        return;
      }
      setTop(`${(coluna.minuto / (duracaoEmHoras(e) * 60)) * 100}%`);
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [dia, inicio, fim]);

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
