"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Leva a tela e o foco ao detalhe que acabou de abrir (26/10/2026): o "Ver
 * detalhes" abria acima da lista sem rolar, e parecia que nada acontecia.
 * Quem chama troca a `key` a cada item aberto, para refazer o foco.
 */
export function FocoAoAbrir({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    ref.current?.focus({ preventScroll: true });
  }, []);
  return <div ref={ref} tabIndex={-1} aria-label={rotulo} role="region" className="scroll-mt-4 outline-none">{children}</div>;
}
