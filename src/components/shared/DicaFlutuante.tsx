"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Dica = { texto: string; x: number; y: number; embaixo: boolean };

/**
 * O que ganha a dica: texto cortado de tabela, `title` de tabela, quem pedir
 * com `data-dica` e texto cortado fora de tabela marcado com `c41-cortavel`
 * (o valor dos cartões de total).
 */
const ALVOS = "[data-dica], table .truncate, table [title], .truncate.c41-cortavel";
const ATRASO_MS = 300;
/** Gráfico (`data-dica-rapida`): quem passa o mouse numa barra está lendo, não passando. */
const ATRASO_RAPIDO_MS = 60;

function cortado(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

/**
 * A dica do Connect para texto que a tabela abreviou.
 *
 * Um componente só, montado no layout, que escuta o mouse na página inteira —
 * e não um `<Tooltip>` em volta de cada célula: são centenas de células com
 * `truncate` em dezenas de telas, e a regra ("mostrar o nome inteiro do que foi
 * cortado") é a mesma em todas. Pedido do Kauan na conferência de 30/09: o
 * `title` nativo já mostrava o texto, mas cru, com atraso de sistema e sem
 * tema escuro.
 *
 * - `.truncate` dentro de tabela: só aparece **quando o texto foi cortado**.
 * - `title` dentro de tabela: aparece sempre, e o nativo é suspenso enquanto o
 *   mouse está em cima (senão saem os dois balões).
 * - `data-dica="…"` em qualquer lugar: opt-in explícito.
 */
export function DicaFlutuante() {
  const [dica, setDica] = useState<Dica | null>(null);

  useEffect(() => {
    let atual: HTMLElement | null = null;
    let tituloGuardado: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function soltar() {
      clearTimeout(timer);
      if (atual && tituloGuardado !== null) atual.setAttribute("title", tituloGuardado);
      atual = null;
      tituloGuardado = null;
      setDica(null);
    }

    function textoDe(el: HTMLElement): string | null {
      if (el.dataset.dica) return el.dataset.dica;
      const titulo = el.getAttribute("title");
      // Texto cortado: a dica só existe se o corte existe. Célula que coube
      // inteira não precisa repetir o que já está à vista.
      if (el.classList.contains("truncate")) return cortado(el) ? (titulo || el.textContent?.trim() || null) : null;
      return titulo || null;
    }

    function entrar(e: MouseEvent) {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>(ALVOS) : null;
      if (el === atual) return;
      soltar();
      if (!el) return;
      const texto = textoDe(el);
      if (!texto) return;
      atual = el;
      if (el.hasAttribute("title")) {
        tituloGuardado = el.getAttribute("title");
        el.removeAttribute("title");
      }
      timer = setTimeout(() => {
        const r = el.getBoundingClientRect();
        const embaixo = r.top < 56;
        setDica({ texto, x: r.left + r.width / 2, y: embaixo ? r.bottom + 8 : r.top - 8, embaixo });
      }, el.hasAttribute("data-dica-rapida") ? ATRASO_RAPIDO_MS : ATRASO_MS);
    }

    function sair(e: MouseEvent) {
      if (!atual) return;
      const para = e.relatedTarget;
      if (para instanceof Node && atual.contains(para)) return;
      soltar();
    }

    document.addEventListener("mouseover", entrar);
    document.addEventListener("mouseout", sair);
    document.addEventListener("mousedown", soltar);
    window.addEventListener("scroll", soltar, true);
    return () => {
      soltar();
      document.removeEventListener("mouseover", entrar);
      document.removeEventListener("mouseout", sair);
      document.removeEventListener("mousedown", soltar);
      window.removeEventListener("scroll", soltar, true);
    };
  }, []);

  if (!dica) return null;
  return createPortal(
    <div
      role="tooltip"
      style={{
        left: Math.min(Math.max(dica.x, 16), window.innerWidth - 16),
        top: dica.y,
        transform: `translate(-50%, ${dica.embaixo ? "0" : "-100%"})`,
      }}
      className="pointer-events-none fixed z-[60] max-w-[min(360px,calc(100vw-2rem))] rounded-md bg-fg px-2.5 py-1.5 text-[12px] leading-snug font-medium text-surface shadow-[var(--c41-shadow-lg)] whitespace-pre-line break-words c41-dica-in"
    >
      {dica.texto}
    </div>,
    document.body
  );
}
