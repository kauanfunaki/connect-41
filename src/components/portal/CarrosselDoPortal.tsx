"use client";

import { useEffect, useState } from "react";

// O carrossel do login do portal (02/10/2026): o que o cliente encontra lá
// dentro, em telas compostas — a tela inteira inclinada e um recorte dela à
// frente —, e não um print cru.
//
// As imagens saíram do Connect LOCAL, com dado fictício (o "Grupo Modelo").
// Página pública nunca mostra dado de cliente: para trocar uma imagem, gerar de
// novo no ambiente local. Ficam em `public/brand/carrossel-do-portal/` porque
// `/brand/` é público no `proxy.ts` — sob `/portal/`, a guarda mandaria a
// imagem para o login.

type Slide = {
  tela: string;
  titulo: string;
  texto: string;
  /** Largura do recorte à frente, em % do quadro — cada recorte tem a sua proporção. */
  detalhe: number;
};

const SLIDES: Slide[] = [
  {
    tela: "documentos",
    titulo: "Suas notas, num lugar só",
    texto: "Notas emitidas e recebidas por todas as suas empresas — e, logo na entrada, o que está esperando por você.",
    detalhe: 66,
  },
  {
    tela: "pendencias",
    titulo: "O que a equipe precisa de você",
    texto: "Cada pendência com prazo e situação. Você responde por aqui, sem e-mail perdido no caminho.",
    detalhe: 50,
  },
  {
    tela: "aprovacoes",
    titulo: "Aprove pagamentos de onde estiver",
    texto: "As contas que dependem do seu ok chegam com o valor e o seu teto. Um clique e o escritório já sabe.",
    detalhe: 74,
  },
  {
    tela: "fluxo",
    titulo: "O caixa da empresa, mês a mês",
    texto: "O que entrou, o que saiu e o que vence nas próximas semanas, sem precisar pedir relatório.",
    detalhe: 54,
  },
];

/** Tempo de cada slide na tela. */
const INTERVALO_MS = 6500;

export function CarrosselDoPortal() {
  const [atual, setAtual] = useState(0);
  // Parado com o mouse ou o foco do teclado em cima — e sempre, para quem
  // pediu menos movimento ao sistema.
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Um timer por slide, e não um intervalo fixo: escolher um slide pelos
    // pontinhos recomeça a contagem.
    const t = window.setTimeout(() => setAtual((i) => (i + 1) % SLIDES.length), INTERVALO_MS);
    return () => window.clearTimeout(t);
  }, [atual, pausado]);

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="O que você encontra no portal"
      className="relative w-full max-w-[640px] flex flex-col gap-10"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <div className="grid">
        {SLIDES.map((s, i) => {
          const ativo = i === atual;
          return (
            <div
              key={s.tela}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${SLIDES.length}: ${s.titulo}`}
              aria-hidden={!ativo}
              inert={!ativo}
              className={`[grid-area:1/1] flex flex-col gap-10 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
                ativo ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
              }`}
            >
              <TelaComposta slide={s} />
              <div className="text-center max-w-[460px] mx-auto">
                <h2 className="text-[24px] font-semibold text-white tracking-[-0.01em] leading-snug [text-wrap:balance]">{s.titulo}</h2>
                <p className="mt-2.5 text-[14px] leading-relaxed text-white/70 [text-wrap:pretty]">{s.texto}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.tela}
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

      <p className="text-center text-[11px] text-white/40 -mt-6">Telas ilustrativas, com dados fictícios.</p>
    </section>
  );
}

/** A tela inteira numa janela inclinada, com o recorte à frente, mais perto. */
function TelaComposta({ slide }: { slide: Slide }) {
  return (
    <div className="relative w-full aspect-[16/11] [perspective:1800px]">
      <div
        className="absolute right-0 top-0 w-[92%] rounded-xl overflow-hidden bg-white shadow-[0_40px_80px_-20px_rgba(4,12,40,0.65)] ring-1 ring-white/15"
        style={{ transform: "rotateY(-13deg) rotateX(5deg) rotateZ(0.6deg)", transformOrigin: "right center" }}
      >
        <div className="flex items-center gap-1.5 h-6 px-3 bg-[#EEEDF2] border-b border-black/5" aria-hidden>
          <span className="size-2 rounded-full bg-[#F26B5E]" />
          <span className="size-2 rounded-full bg-[#F5BE4F]" />
          <span className="size-2 rounded-full bg-[#5CC46A]" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/brand/carrossel-do-portal/${slide.tela}.webp`}
          alt=""
          width={1600}
          height={1000}
          loading="lazy"
          decoding="async"
          className="block w-full h-auto"
        />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/carrossel-do-portal/${slide.tela}-detalhe.webp`}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute left-0 bottom-[3%] h-auto rounded-xl bg-[#F4F3F7] p-1.5 shadow-[0_28px_60px_-14px_rgba(4,12,40,0.7)] ring-1 ring-black/5"
        style={{ width: `${slide.detalhe}%`, transform: "rotateY(-6deg) translateZ(40px)" }}
      />
    </div>
  );
}
