"use client";

import { useId, useRef } from "react";
import { PRIORIDADES, ROTULOS_PRIORIDADE, type Prioridade } from "@/lib/chamados/regras";

// Da esquerda para a direita, mais urgente (27/10/2026): verde, amarelo,
// laranja e vermelho, com o triângulo embaixo da faixa escolhida.
const CORES: Record<Prioridade, string> = { BAIXA: "#23A55A", MEDIA: "#F2C12E", ALTA: "#F28C28", URGENTE: "#E5484D" };

/** Prioridade como controle deslizante de quatro faixas: arrastar, clicar ou usar as setas. */
export function SeletorDePrioridade({ value, onChange, disabled = false }: { value: Prioridade; onChange: (p: Prioridade) => void; disabled?: boolean }) {
  const rotulo = useId(), trilho = useRef<HTMLDivElement>(null);
  const indice = Math.max(PRIORIDADES.indexOf(value), 0);
  // Uma div não herda o `disabled` do fieldset, como os campos nativos.
  const escolher = (i: number) => { if (trilho.current?.closest("fieldset:disabled")) return; const p = PRIORIDADES[Math.min(Math.max(i, 0), PRIORIDADES.length - 1)]; if (p !== value) onChange(p); };
  const pelaPosicao = (x: number) => {
    const r = trilho.current?.getBoundingClientRect(); if (!r?.width) return;
    escolher(Math.floor(((x - r.left) / r.width) * PRIORIDADES.length));
  };
  function teclas(e: React.KeyboardEvent) {
    const destino = { ArrowRight: indice + 1, ArrowUp: indice + 1, ArrowLeft: indice - 1, ArrowDown: indice - 1, Home: 0, End: PRIORIDADES.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault(); escolher(destino);
  }
  return <div className="flex min-w-0 flex-col gap-1.5 text-ui text-fg-secondary">
    <span id={rotulo} className="font-semibold">Prioridade</span>
    <div className="flex items-center gap-4">
      <div ref={trilho} role="slider" tabIndex={disabled ? -1 : 0} aria-labelledby={rotulo} aria-disabled={disabled || undefined}
        aria-valuemin={0} aria-valuemax={PRIORIDADES.length - 1} aria-valuenow={indice} aria-valuetext={ROTULOS_PRIORIDADE[value]}
        onKeyDown={disabled ? undefined : teclas}
        onPointerDown={disabled ? undefined : e => { e.currentTarget.setPointerCapture(e.pointerId); pelaPosicao(e.clientX); }}
        onPointerMove={disabled ? undefined : e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pelaPosicao(e.clientX); }}
        className={`relative grid w-full max-w-72 touch-none select-none grid-cols-4 gap-1 rounded-full pb-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
        {PRIORIDADES.map(p => <span key={p} aria-hidden className="h-3 rounded-full" style={{ backgroundColor: CORES[p] }} />)}
        <span aria-hidden className="absolute bottom-0 size-0 -translate-x-1/2 border-x-[6px] border-b-[8px] border-x-transparent border-b-fg transition-[left] duration-150 motion-reduce:transition-none"
          style={{ left: `${((indice + 0.5) / PRIORIDADES.length) * 100}%` }} />
      </div>
      <span aria-hidden className="w-16 shrink-0 self-start font-semibold leading-3 text-fg">{ROTULOS_PRIORIDADE[value]}</span>
    </div>
  </div>;
}
