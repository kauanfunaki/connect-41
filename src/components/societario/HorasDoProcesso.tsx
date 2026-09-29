"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { IconButton } from "@/components/ui/IconButton";
import { formatarDecorrido, minutosApontados, segundosDesde } from "@/lib/datetime";
import type { HorasState } from "@/app/(app)/processos/horas-actions";

export type LancamentoDeHoras = { id: string; quem: string; minutos: number; dia: string; nota: string | null; meu: boolean };

const duracao = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}min` : m === 0 ? `${h}h` : `${h}h${m}min`;
};

/**
 * As horas trabalhadas no processo: cronômetro (um por vez) e lançamento
 * manual. Alimenta as horas de operação da Gestão.
 */
export function HorasDoProcesso({
  processId,
  lancamentos,
  cronometro,
  podeAgir,
  acoes,
}: {
  processId: string;
  lancamentos: LancamentoDeHoras[];
  /** Quem está com o cronômetro, desde quando, e se é quem está vendo. */
  cronometro: { quem: string; desdeIso: string; meu: boolean } | null;
  podeAgir: boolean;
  acoes: {
    iniciar: (id: string) => Promise<HorasState>;
    parar: (id: string) => Promise<HorasState>;
    lancar: (id: string, prev: HorasState, form: FormData) => Promise<HorasState>;
    apagar: (id: string, entryId: string) => Promise<HorasState>;
  };
}) {
  const [segundos, setSegundos] = useState(() => (cronometro ? segundosDesde(cronometro.desdeIso) : 0));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [abrirLancamento, setAbrirLancamento] = useState(false);
  const [estado, lancar, lancando] = useActionState(acoes.lancar.bind(null, processId), null);

  useEffect(() => {
    if (!cronometro) return;
    const t = setInterval(() => setSegundos(segundosDesde(cronometro.desdeIso)), 1000);
    return () => clearInterval(t);
  }, [cronometro]);

  const total = lancamentos.reduce((s, l) => s + l.minutos, 0);
  const rodar = (fn: () => Promise<HorasState>) =>
    startTransition(async () => {
      setErro(null);
      const r = await fn();
      if (r && "error" in r) setErro(r.error);
    });

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-fg">Horas trabalhadas</h2>
          <p className="text-[12px] text-fg-muted">
            {total > 0 ? `${duracao(total)} neste processo` : "Nenhuma hora lançada ainda."} Entram nas horas de operação da Gestão.
          </p>
        </div>
        {podeAgir && (
          <div className="flex flex-wrap items-center gap-2">
            {cronometro ? (
              cronometro.meu ? (
                <Button variant="primary" disabled={pendente} onClick={() => rodar(() => acoes.parar(processId))}>
                  Parar {formatarDecorrido(segundos)} · lança {minutosApontados(segundos)} min
                </Button>
              ) : (
                <span className="text-[12px] text-fg-muted">
                  {cronometro.quem} está com o cronômetro ({formatarDecorrido(segundos)})
                </span>
              )
            ) : (
              <Button variant="secondary" disabled={pendente} onClick={() => rodar(() => acoes.iniciar(processId))}>
                Iniciar cronômetro
              </Button>
            )}
            <Button variant="ghost" onClick={() => setAbrirLancamento((v) => !v)}>
              + Lançar horas
            </Button>
          </div>
        )}
      </div>

      {erro && <p className="text-[12px] text-danger">{erro}</p>}

      {abrirLancamento && podeAgir && (
        <form action={lancar} className="flex flex-wrap items-end gap-2 rounded-md bg-surface-2 p-3">
          <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
            Horas
            <Input name="horas" inputMode="decimal" placeholder="0" className="w-20 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
            Minutos
            <Input name="minutos" inputMode="numeric" placeholder="0" className="w-20 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
            Dia
            <Input name="dia" type="date" className="w-40" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-fg-muted flex-1 min-w-48">
            O que foi feito
            <Input name="nota" maxLength={280} placeholder="Opcional" />
          </label>
          <Button type="submit" variant="primary" disabled={lancando}>
            {lancando ? "Lançando…" : "Lançar"}
          </Button>
          {estado && "error" in estado && <p className="w-full text-[12px] text-danger">{estado.error}</p>}
        </form>
      )}

      {lancamentos.length > 0 && (
        <ul className="flex flex-col divide-y divide-border text-[12px]">
          {lancamentos.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-fg-secondary">
                <span className="text-fg tabular-nums">{duracao(l.minutos)}</span> · {l.quem} · {l.dia}
                {l.nota && ` · ${l.nota}`}
              </span>
              {l.meu && podeAgir && (
                <IconButton aria-label="Apagar lançamento" onClick={() => rodar(() => acoes.apagar(processId, l.id))} disabled={pendente}>
                  <Trash2 size={14} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
