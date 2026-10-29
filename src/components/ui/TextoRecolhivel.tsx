"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Texto longo cortado em poucas linhas, com "Ver mais" / "Ver menos". O botão só
// aparece quando o texto de fato passa do limite.
export function TextoRecolhivel({ texto, linhas = 3, className = "" }: { texto: string; linhas?: number; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [aberto, setAberto] = useState(false);
  const [cortado, setCortado] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || aberto) return;
    const medir = () => setCortado(el.scrollHeight > el.clientHeight + 1);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [texto, linhas, aberto]);

  return (
    <div className={className}>
      <p ref={ref} className="whitespace-pre-line break-words text-ui leading-relaxed text-fg-secondary" style={aberto ? undefined : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: linhas, overflow: "hidden" }}>{texto}</p>
      {(cortado || aberto) && <button type="button" aria-expanded={aberto} onClick={() => setAberto(a => !a)} className="mt-1 text-helper font-medium text-brand hover:underline">{aberto ? "Ver menos" : "Ver mais"}</button>}
    </div>
  );
}
