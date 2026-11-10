"use client";

import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MeetingItem } from "./MeetingItem";
import { LinhaDoPrazo } from "./LinhaDoPrazo";
import { dayNumber, diaDaListaLabel, isSameMonth, monthYearLabel, saoPauloParts } from "@/lib/agenda";
import { defDaFonte } from "@/lib/fontesDaAgenda";
import { formatInstantTime } from "@/lib/format";
import type { PrazoDaAgenda } from "@/lib/prazosDaAgendaRegras";
import type { CalendarDay, MeetingActions, MeetingRow } from "./types";

const DIAS_DA_SEMANA = [
  { curto: "Seg", nome: "segunda-feira" },
  { curto: "Ter", nome: "terça-feira" },
  { curto: "Qua", nome: "quarta-feira" },
  { curto: "Qui", nome: "quinta-feira" },
  { curto: "Sex", nome: "sexta-feira" },
  { curto: "Sáb", nome: "sábado" },
  { curto: "Dom", nome: "domingo" },
];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Quantos itens a célula mostra antes do "+N" (desenho B: dois). */
const NA_CELULA = 2;

type Props = {
  /** 42 dias (6 semanas), começando numa segunda-feira. */
  days: CalendarDay[];
  /** Data de referência — o mês mostrado; dias fora dele vêm esmaecidos. */
  monthKey: string;
  prazos: PrazoDaAgenda[];
  meetings: MeetingRow[];
  actions: MeetingActions;
  hoje: string;
  /** Só para quem marca reunião e é de setor que usa reuniões. */
  onNovaReuniao?: (dateKey: string) => void;
};

function horaDe(iso: string): string {
  return formatInstantTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });
}

/**
 * A visão Mês (10/11/2026, desenho B aprovado pelo Kauan): o calendário do mês
 * com até dois prazos (e reuniões) por dia e "+N", hoje contornado, e o dia
 * escolhido aberto ao lado, com tudo dele. Substitui a grade de mês de antes,
 * que levava à visão de dia a cada clique.
 *
 * Teclado: é uma grade (`role="grid"`) com um dia só na ordem de tabulação —
 * as setas andam um dia ou uma semana, Home e End vão ao começo e ao fim da
 * semana, e o dia em foco é o que se abre ao lado. Cada dia diz ao leitor de
 * tela o que tem ("11 de novembro, 3 prazos").
 */
export function MesDosPrazos({ days, monthKey, prazos, meetings, actions, hoje, onNovaReuniao }: Props) {
  const [aberto, setAberto] = useState(() => (isSameMonth(hoje, monthKey) ? hoje : monthKey));
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  const prazosDoDia = useMemo(() => {
    const m = new Map<string, PrazoDaAgenda[]>();
    for (const p of prazos) m.set(p.dia, [...(m.get(p.dia) ?? []), p]);
    return m;
  }, [prazos]);

  const reunioesDoDia = useMemo(() => {
    const m = new Map<string, MeetingRow[]>();
    for (const r of meetings) {
      const k = saoPauloParts(new Date(r.startAt)).dateKey;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    for (const l of m.values()) l.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return m;
  }, [meetings]);

  const semanas = Array.from({ length: Math.ceil(days.length / 7) }, (_, s) => days.slice(s * 7, s * 7 + 7));

  function rotulo(dia: string): string {
    const [, mes, d] = dia.split("-").map(Number);
    const nPrazos = (prazosDoDia.get(dia) ?? []).reduce((s, p) => s + p.quantos, 0);
    const nReunioes = (reunioesDoDia.get(dia) ?? []).length;
    const partes = [`${d} de ${MESES[mes - 1]}`];
    if (dia === hoje) partes.push("hoje");
    partes.push(nPrazos === 0 ? "nenhum prazo" : `${nPrazos} ${nPrazos === 1 ? "prazo" : "prazos"}`);
    if (nReunioes > 0) partes.push(`${nReunioes} ${nReunioes === 1 ? "reunião" : "reuniões"}`);
    return partes.join(", ");
  }

  function irPara(indice: number) {
    const alvo = Math.max(0, Math.min(days.length - 1, indice));
    setAberto(days[alvo].dateKey);
    botoes.current[alvo]?.focus();
  }

  function aoTeclar(e: React.KeyboardEvent, indice: number) {
    const passo: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in passo) irPara(indice + passo[e.key]);
    else if (e.key === "Home") irPara(indice - (indice % 7));
    else if (e.key === "End") irPara(indice - (indice % 7) + 6);
    else return;
    e.preventDefault();
  }

  const prazosAbertos = prazosDoDia.get(aberto) ?? [];
  const reunioesAbertas = reunioesDoDia.get(aberto) ?? [];

  return (
    <div className="h-full flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
      <div role="grid" aria-label={`Prazos de ${monthYearLabel(monthKey).toLowerCase()}`} className="flex flex-col flex-1 min-h-0 min-w-0">
        <div role="row" className="grid grid-cols-7 border-b border-border flex-shrink-0">
          {DIAS_DA_SEMANA.map((d) => (
            <div key={d.curto} role="columnheader" aria-label={d.nome} className="py-2 text-center border-l border-border first:border-l-0">
              <span className="text-micro font-medium text-fg-muted uppercase tracking-wide">{d.curto}</span>
            </div>
          ))}
        </div>
        {semanas.map((semana, s) => (
          <div key={semana[0].dateKey} role="row" className="grid grid-cols-7 flex-1 min-h-[66px] sm:min-h-[84px] lg:min-h-0">
            {semana.map((d, i) => {
              const indice = s * 7 + i;
              const doDia = prazosDoDia.get(d.dateKey) ?? [];
              const reunioes = reunioesDoDia.get(d.dateKey) ?? [];
              const total = doDia.length + reunioes.length;
              const fora = !isSameMonth(d.dateKey, monthKey);
              const selecionado = d.dateKey === aberto;
              const naCelulaPrazos = doDia.slice(0, NA_CELULA);
              const naCelulaReunioes = reunioes.slice(0, Math.max(0, NA_CELULA - naCelulaPrazos.length));
              const resto = total - naCelulaPrazos.length - naCelulaReunioes.length;
              return (
                <div
                  key={d.dateKey}
                  role="gridcell"
                  aria-selected={selecionado}
                  className={`border-t border-l border-border first:border-l-0 min-w-0 ${
                    selecionado ? "bg-brand-subtle" : fora ? "bg-surface-hover/40" : ""
                  }`}
                >
                  <button
                    ref={(el) => {
                      botoes.current[indice] = el;
                    }}
                    type="button"
                    tabIndex={selecionado ? 0 : -1}
                    aria-label={rotulo(d.dateKey)}
                    aria-current={d.dateKey === hoje ? "date" : undefined}
                    onClick={() => setAberto(d.dateKey)}
                    onKeyDown={(e) => aoTeclar(e, indice)}
                    className="h-full w-full flex flex-col items-stretch gap-0.5 p-1 sm:p-1.5 text-left overflow-hidden hover:bg-surface-hover/60 transition-colors focus-visible:relative focus-visible:z-10"
                  >
                    <span
                      className={`inline-flex w-6 h-6 flex-shrink-0 items-center justify-center rounded-full text-fs-2 tnum ${
                        d.dateKey === hoje
                          ? "ring-2 ring-brand text-brand font-semibold"
                          : fora
                            ? "text-fg-muted/60"
                            : "text-fg"
                      }`}
                    >
                      {dayNumber(d.dateKey)}
                    </span>
                    <span className="hidden sm:flex flex-col gap-0.5 min-w-0">
                      {naCelulaPrazos.map((p) => (
                        <span key={p.chave} className="flex items-center gap-1 min-w-0 text-micro leading-tight text-fg">
                          <span aria-hidden className="size-1.5 flex-shrink-0 rounded-full" style={{ background: defDaFonte(p.fonte).cor }} />
                          <span className={`truncate ${p.atrasada ? "text-danger" : ""}`}>{p.titulo}</span>
                        </span>
                      ))}
                      {naCelulaReunioes.map((r) => (
                        <span key={r.id} className="flex items-center gap-1 min-w-0 text-micro leading-tight text-fg">
                          <span
                            aria-hidden
                            className="size-1.5 flex-shrink-0 rounded-[2px]"
                            style={{ background: r.provider === "GOOGLE" ? "var(--c41-brand)" : "var(--c41-info)" }}
                          />
                          <span className="tnum text-fg-muted flex-shrink-0">{horaDe(r.startAt)}</span>
                          <span className="truncate">{r.title}</span>
                        </span>
                      ))}
                      {resto > 0 && <span className="text-micro font-semibold text-brand">+{resto}</span>}
                    </span>
                    {/* Celular: só a densidade do dia, em bolinhas — texto não cabe. */}
                    {total > 0 && (
                      <span aria-hidden className="sm:hidden flex flex-wrap items-center gap-0.5">
                        {doDia.slice(0, 3).map((p) => (
                          <span key={p.chave} className="size-1.5 rounded-full" style={{ background: defDaFonte(p.fonte).cor }} />
                        ))}
                        {reunioes.slice(0, 2).map((r) => (
                          <span key={r.id} className="size-1.5 rounded-[2px] bg-info" />
                        ))}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <aside
        aria-labelledby="agenda-dia-aberto"
        className="lg:w-80 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border lg:overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
          <h3 id="agenda-dia-aberto" aria-live="polite" className="text-card-title font-semibold text-fg">
            {diaDaListaLabel(aberto)}
          </h3>
          {onNovaReuniao && (
            <Button variant="secondary" size="xs" onClick={() => onNovaReuniao(aberto)}>
              <Plus size={12} /> Reunião
            </Button>
          )}
        </div>
        {prazosAbertos.length === 0 && reunioesAbertas.length === 0 ? (
          <p className="px-4 py-5 text-body text-fg-muted">
            Nada neste dia nas fontes ligadas. Escolha outro dia no calendário — as setas do teclado também andam.
          </p>
        ) : (
          <ul className="divide-y divide-border px-4 pb-3">
            {prazosAbertos.map((p) => (
              <li key={p.chave}>
                <LinhaDoPrazo prazo={p} variante="compacta" />
              </li>
            ))}
            {reunioesAbertas.map((r) => (
              <li key={r.id} className="py-2">
                <MeetingItem meeting={r} actions={actions} variant="chip" />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
