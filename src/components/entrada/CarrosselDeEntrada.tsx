"use client";

import { useEffect, useState } from "react";

// O carrossel das telas de entrada — o do portal do cliente (02/10/2026) e o da
// equipe (06/10/2026). Aqui mora só o mecanismo e as peças das cenas; o que
// cada um mostra fica com quem usa (`portal/CarrosselDoPortal`,
// `login/CarrosselDaEquipe`).
//
// As cenas são desenhadas em código: nítidas em qualquer tela, sem imagem para
// baixar e sem dado de cliente — os nomes e valores são inventados.
//
// O painel é sempre azul da marca, nos dois temas: as cenas usam cartões claros
// com cores próprias, e não as do tema.

export type SlideDeEntrada = { chave: string; titulo: string; texto: string; Cena: () => React.ReactNode };

/** Tempo de cada slide na tela. */
const INTERVALO_MS = 6500;

export function CarrosselDeEntrada({ rotulo, slides }: { rotulo: string; slides: SlideDeEntrada[] }) {
  const [atual, setAtual] = useState(0);
  // Parado com o mouse ou o foco do teclado em cima — e sempre, para quem
  // pediu menos movimento ao sistema.
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Um timer por slide, e não um intervalo fixo: escolher um slide pelos
    // pontinhos recomeça a contagem.
    const t = window.setTimeout(() => setAtual((i) => (i + 1) % slides.length), INTERVALO_MS);
    return () => window.clearTimeout(t);
  }, [atual, pausado, slides.length]);

  return (
    <section
      aria-roledescription="carrossel"
      aria-label={rotulo}
      className="relative w-full max-w-[640px] flex flex-col gap-10"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <div className="grid">
        {slides.map((s, i) => {
          const ativo = i === atual;
          return (
            <div
              key={s.chave}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${slides.length}: ${s.titulo}`}
              aria-hidden={!ativo}
              inert={!ativo}
              data-ativo={ativo}
              className={`group/slide [grid-area:1/1] flex flex-col gap-10 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
                ativo ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
              }`}
            >
              {/* A cena é decorativa: o título e o texto embaixo dizem o que ela mostra. */}
              <div aria-hidden className="relative w-full aspect-[16/11] select-none">
                <s.Cena />
              </div>
              <div className="text-center max-w-[460px] mx-auto">
                <h2 className="text-[24px] font-semibold text-white tracking-[-0.01em] leading-snug [text-wrap:balance]">{s.titulo}</h2>
                <p className="mt-2.5 text-[14px] leading-relaxed text-white/70 [text-wrap:pretty]">{s.texto}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2">
        {slides.map((s, i) => (
          <button
            key={s.chave}
            type="button"
            onClick={() => setAtual(i)}
            aria-label={`Mostrar: ${s.titulo}`}
            aria-current={i === atual}
            className="group/ponto p-1.5 -m-1 rounded-full focus-visible:outline-2 focus-visible:outline-white/80"
          >
            <span
              className={`block h-2 rounded-full transition-all duration-300 ${
                i === atual ? "w-7 bg-white" : "w-2 bg-white/35 group-hover/ponto:bg-white/60"
              }`}
            />
          </button>
        ))}
      </div>

      <p className="text-center text-[11px] text-white/40 -mt-6">Ilustrações com dados fictícios.</p>
    </section>
  );
}

// ─── Peças das cenas ──────────────────────────────────────────────────────────

/** Cartão claro das cenas. `entrar` dá o atraso da entrada quando o slide fica ativo. */
export function Cartao({ className = "", style, entrar = 0, children }: { className?: string; style?: React.CSSProperties; entrar?: number; children: React.ReactNode }) {
  return (
    <div
      className={`absolute rounded-2xl bg-white text-[#141824] shadow-[0_28px_60px_-18px_rgba(4,12,40,0.6)] ring-1 ring-black/5 transition-[opacity,translate] duration-700 ease-out motion-reduce:transition-none opacity-0 translate-y-4 group-data-[ativo=true]/slide:opacity-100 group-data-[ativo=true]/slide:translate-y-0 ${className}`}
      style={{ transitionDelay: `${entrar}ms`, ...style }}
    >
      {children}
    </div>
  );
}

export type CorDoSelo = "azul" | "verde" | "ambar" | "vermelho" | "violeta" | "cinza";

export function Selo({ cor, children }: { cor: CorDoSelo; children: React.ReactNode }) {
  const cores = {
    azul: "bg-[#E8EFFD] text-[#1F5EEA]",
    verde: "bg-[#E2F5EC] text-[#0E7A55]",
    ambar: "bg-[#FBF0DC] text-[#9A5B00]",
    vermelho: "bg-[#FBE6E3] text-[#B3372C]",
    violeta: "bg-[#EFE8FB] text-[#6D3FC0]",
    cinza: "bg-[#EEF0F5] text-[#4B5468]",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${cores[cor]}`}>{children}</span>;
}
