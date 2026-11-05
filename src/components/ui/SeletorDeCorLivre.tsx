"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { hexParaHsv, hsvParaHex, type Hsv } from "@/lib/aparencia/hsv";

/**
 * A cor livre (05/11/2026, pedido do Kauan, na referência do seletor do
 * Google): o quadrado de saturação e brilho, a faixa de matiz e o hexadecimal
 * para colar. Nada vale até o "Confirmar" — arrastar não aplica a cor a cada
 * passo. Sem as cores prontas: elas ficam no seletor de fora.
 *
 * O quadrado anda também pelo teclado (setas: ←→ saturação, ↑↓ brilho; com
 * Shift, de 10 em 10), e a matiz é um `range` nativo.
 */
export function SeletorDeCorLivre({
  valor,
  onConfirmar,
  onCancelar,
  motivoDaRecusa,
}: {
  valor: string;
  onConfirmar: (cor: string) => void;
  onCancelar: () => void;
  /** Por que a cor não serve (quase branca, cinza…), ou `null`. */
  motivoDaRecusa?: (cor: string) => string | null;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexParaHsv(valor) ?? { h: 340, s: 0.87, v: 0.91 });
  const cor = hsvParaHex(hsv);
  const [texto, setTexto] = useState(cor.slice(1));
  const quadro = useRef<HTMLDivElement>(null);

  function mudar(novo: Hsv) {
    setHsv(novo);
    setTexto(hsvParaHex(novo).slice(1));
  }

  function noQuadro(e: React.PointerEvent<HTMLDivElement>) {
    const r = quadro.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    mudar({ ...hsv, s, v });
  }

  function setas(e: React.KeyboardEvent) {
    const passo = e.shiftKey ? 0.1 : 0.01;
    const d: Record<string, [number, number]> = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, passo], ArrowDown: [0, -passo] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    mudar({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + m[0])), v: Math.min(1, Math.max(0, hsv.v + m[1])) });
  }

  const recusa = motivoDaRecusa?.(cor) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={quadro}
        role="slider"
        tabIndex={0}
        aria-label="Saturação e brilho"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`saturação ${Math.round(hsv.s * 100)}%, brilho ${Math.round(hsv.v * 100)}%`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          noQuadro(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) noQuadro(e);
        }}
        onKeyDown={setas}
        className="relative h-40 w-full cursor-crosshair touch-none rounded-md outline-offset-2 focus-visible:outline-3 focus-visible:outline-focus-ring"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h} 100% 50%)`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: cor }}
        />
      </div>

      <input
        type="range"
        min={0}
        max={359}
        value={Math.round(hsv.h)}
        onChange={(e) => mudar({ ...hsv, h: Number(e.target.value) })}
        aria-label="Matiz"
        className="c41-faixa-de-matiz"
      />

      <div className="flex items-center gap-2">
        <span aria-hidden className="size-8 flex-shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style={{ background: cor }} />
        <Input
          compact
          prefix="#"
          value={texto}
          onChange={(e) => {
            const limpo = e.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
            setTexto(limpo);
            const lido = limpo.length === 6 ? hexParaHsv(limpo) : null;
            if (lido) setHsv(lido);
          }}
          onBlur={() => setTexto(cor.slice(1))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !recusa) {
              e.preventDefault();
              onConfirmar(cor);
            }
          }}
          aria-label="Cor em hexadecimal"
          spellCheck={false}
          autoComplete="off"
          className="w-28 font-mono"
        />
      </div>

      {recusa && <p className="text-helper text-danger" role="status">{recusa}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="button" size="sm" variant="primary" disabled={!!recusa} onClick={() => onConfirmar(cor)}>
          Confirmar
        </Button>
      </div>
    </div>
  );
}
