"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { IconButton } from "@/components/ui/IconButton";
import { formatarDecorrido, minutosApontados, segundosDesde } from "@/lib/datetime";
import type { HorasState } from "@/app/(app)/processos/horas-actions";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";

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
    <Card as="section" aria-labelledby="horas-do-processo" className="p-4 flex flex-col gap-3">
      {/* Botões `sm` no cabeçalho do cartão, como os das etapas do roteiro:
          eram h-9, maiores que tudo o que o cartão tem embaixo. Na coluna da
          direita (08/10/2026) eles descem para baixo do título. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {/* Título de seção da ficha em 18px (padrão aceito na página de
              decisões, 08/10/2026) — era o de cartão em grade, 14px. */}
          <h2 id="horas-do-processo" className="text-section font-semibold text-fg">Horas trabalhadas</h2>
          <p className="text-[length:var(--fs-2)] text-fg-muted">
            {total > 0 ? `${duracao(total)} neste processo` : "Nenhuma hora lançada ainda."} Entram nas horas de operação da Gestão.
          </p>
        </div>
        {podeAgir && (
          <div className="flex flex-wrap items-center gap-2">
            {cronometro ? (
              cronometro.meu ? (
                <Button variant="primary" size="sm" disabled={pendente} onClick={() => rodar(() => acoes.parar(processId))}>
                  Parar {formatarDecorrido(segundos)} · lança {minutosApontados(segundos)} min
                </Button>
              ) : (
                <span className="text-[length:var(--fs-2)] text-fg-muted">
                  {cronometro.quem} está com o cronômetro ({formatarDecorrido(segundos)})
                </span>
              )
            ) : (
              <Button variant="secondary" size="sm" disabled={pendente} onClick={() => rodar(() => acoes.iniciar(processId))}>
                Iniciar cronômetro
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setAbrirLancamento((v) => !v)}>
              <Plus size={14} /> Lançar horas
            </Button>
          </div>
        )}
      </div>

      {/* Na caixa de erro do resto da página (07/10/2026) — era texto solto de 12px. */}
      {erro && (
        <Aviso>
          {erro}
        </Aviso>
      )}

      {abrirLancamento && podeAgir && (
        // Campos em grade — horas e minutos estreitos, a data na largura dela —
        // e os botões no rodapé. Era um flex-wrap com rótulos de 12px feitos à
        // mão, e o "Lançar" quebrava para a linha de baixo conforme a largura.
        // A nota ganhou linha própria em 08/10/2026: na coluna da direita do
        // processo (uns 400px), ao lado das outras três ela ficava sem largura.
        <form action={lancar} className="flex flex-col gap-4 rounded-md bg-surface-2 p-4">
          <FieldGrid columns="sm:grid-cols-[4.5rem_4.5rem_minmax(0,11rem)]">
            <CampoForm label="Horas" htmlFor={`horas-${processId}`}>
              <Input id={`horas-${processId}`} name="horas" inputMode="decimal" placeholder="0" className="tabular-nums" />
            </CampoForm>
            <CampoForm label="Minutos" htmlFor={`minutos-${processId}`}>
              <Input id={`minutos-${processId}`} name="minutos" inputMode="numeric" placeholder="0" className="tabular-nums" />
            </CampoForm>
            <CampoForm label="Dia" htmlFor={`dia-${processId}`}>
              <CampoData id={`dia-${processId}`} name="dia" />
            </CampoForm>
          </FieldGrid>
          <CampoForm label="O que foi feito" htmlFor={`nota-${processId}`}>
            <Input id={`nota-${processId}`} name="nota" maxLength={280} placeholder="Opcional" />
          </CampoForm>
          {estado && "error" in estado && (
            <Aviso>
              {estado.error}
            </Aviso>
          )}
          <FormFooter
            pending={lancando}
            pendingLabel="Lançando…"
            submitLabel="Lançar"
            onCancel={() => setAbrirLancamento(false)}
            semDivisoria
          />
        </form>
      )}

      {lancamentos.length > 0 && (
        <ul className="flex flex-col divide-y divide-border text-[length:var(--fs-2)]">
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
