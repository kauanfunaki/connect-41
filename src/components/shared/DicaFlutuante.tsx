"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { SELETOR_DOS_ALVOS, devolverTitulo, suspenderTitulo, textoDaDica, type TituloGuardado } from "./dicaDoTitulo";

type Dica = { texto: string; x: number; y: number; embaixo: boolean };

const ATRASO_MS = 300;
/** Gráfico (`data-dica-rapida`): quem passa o mouse numa barra está lendo, não passando. */
const ATRASO_RAPIDO_MS = 60;

function cortado(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

// Montada em mais de um layout (o raiz, o da equipe, o do portal): só a
// primeira ainda montada escuta a página — duas escutando trocariam o mesmo
// `title` e abririam dois balões. Quando ela sai, a seguinte assume.
let instancias: symbol[] = [];
const avisos = new Set<() => void>();
function avisar() {
  avisos.forEach((a) => a());
}
function assinar(aviso: () => void) {
  avisos.add(aviso);
  return () => {
    avisos.delete(aviso);
  };
}
function registrar(id: symbol) {
  instancias = [...instancias, id];
  avisar();
  return () => {
    instancias = instancias.filter((i) => i !== id);
    avisar();
  };
}

/**
 * A dica do Connect — para texto cortado e para todo `title` da interface.
 *
 * Um componente só, montado no layout, que escuta o mouse na página inteira —
 * e não um `<Tooltip>` em volta de cada elemento: são centenas de células com
 * `truncate` e de botões com `title` em dezenas de telas, e a regra é a mesma
 * em todas. Pedido do Kauan na conferência de 30/09: o `title` nativo já
 * mostrava o texto, mas cru, com atraso de sistema e sem tema escuro.
 *
 * - `.truncate` dentro de tabela (ou com `title`, em qualquer lugar): só
 *   aparece **quando o texto foi cortado** — e o balão do sistema não sai
 *   quando coube inteiro.
 * - `title` em qualquer lugar (08/10/2026; antes, só em tabela): aparece
 *   sempre, e o nativo é suspenso enquanto a dica está aberta — o que ele
 *   dizia ao leitor de tela vai para `aria-label`/`aria-description` nesse
 *   meio-tempo (ver `suspenderTitulo`).
 * - `data-dica="…"` em qualquer lugar: opt-in explícito, sem `title` nenhum —
 *   o caminho dos componentes de base (`IconButton`, `MenuDeMaisAcoes`…).
 *
 * Também no teclado e no toque (07/10/2026): a dica abre no foco por teclado
 * (`:focus-visible`) e ao tocar no celular — o valor em reais de cada faixa
 * dos gráficos da Home só existia na dica, e só o mouse a abria. No toque, o
 * `mousedown` de compatibilidade que o navegador dispara logo depois não fecha
 * a dica que acabou de abrir.
 */
export function DicaFlutuante() {
  const [id] = useState(() => Symbol("dica"));
  const ativa = useSyncExternalStore(assinar, () => instancias[0] === id, () => false);
  const [dica, setDica] = useState<Dica | null>(null);

  useEffect(() => registrar(id), [id]);

  useEffect(() => {
    if (!ativa) return;
    let atual: HTMLElement | null = null;
    let guardado: TituloGuardado | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function soltar() {
      clearTimeout(timer);
      if (atual && guardado) devolverTitulo(atual, guardado);
      atual = null;
      guardado = null;
      setDica(null);
    }

    function alvoDe(alvo: EventTarget | null): HTMLElement | null {
      return alvo instanceof Element ? alvo.closest<HTMLElement>(SELETOR_DOS_ALVOS) : null;
    }

    function mostrar(el: HTMLElement, atraso: number) {
      soltar();
      const texto = textoDaDica(el, () => cortado(el));
      // O `title` sai mesmo sem dica: no texto cortado que coube inteiro, o
      // balão do sistema repetiria o que já está à vista.
      atual = el;
      guardado = suspenderTitulo(el);
      if (!texto) return;
      timer = setTimeout(() => {
        const r = el.getBoundingClientRect();
        const embaixo = r.top < 56;
        setDica({ texto, x: r.left + r.width / 2, y: embaixo ? r.bottom + 8 : r.top - 8, embaixo });
      }, atraso);
    }

    function entrar(e: MouseEvent) {
      const el = alvoDe(e.target);
      if (el === atual) return;
      if (!el) {
        soltar();
        return;
      }
      mostrar(el, el.hasAttribute("data-dica-rapida") ? ATRASO_RAPIDO_MS : ATRASO_MS);
    }

    // Toque: abre na hora; tocar fora fecha. Guarda o instante para o
    // `mousedown` de compatibilidade, que chega em seguida, não fechar.
    let toqueEm = 0;
    function tocar(e: PointerEvent) {
      if (e.pointerType !== "touch") return;
      toqueEm = Date.now();
      const el = alvoDe(e.target);
      if (el === atual) return;
      if (!el) {
        soltar();
        return;
      }
      mostrar(el, 0);
    }

    function pressionar() {
      if (Date.now() - toqueEm < 800) return;
      soltar();
    }

    // Teclado: só o foco visível — o clique também foca, e não deve abrir dica.
    function focar(e: FocusEvent) {
      const el = alvoDe(e.target);
      if (!el || el === atual) return;
      if (!(e.target instanceof Element) || !e.target.matches(":focus-visible")) return;
      mostrar(el, ATRASO_RAPIDO_MS);
    }

    function desfocar(e: FocusEvent) {
      if (!atual) return;
      const para = e.relatedTarget;
      if (para instanceof Node && atual.contains(para)) return;
      soltar();
    }

    function sair(e: MouseEvent) {
      if (!atual) return;
      const para = e.relatedTarget;
      if (para instanceof Node && atual.contains(para)) return;
      soltar();
    }

    // Esc fecha a dica, como o balão do sistema (sem marcar o evento: quem
    // está embaixo — um modal — continua recebendo o Esc).
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape" && atual) soltar();
    }

    document.addEventListener("mouseover", entrar);
    document.addEventListener("mouseout", sair);
    document.addEventListener("pointerdown", tocar);
    document.addEventListener("mousedown", pressionar);
    document.addEventListener("focusin", focar);
    document.addEventListener("focusout", desfocar);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", soltar, true);
    return () => {
      soltar();
      document.removeEventListener("mouseover", entrar);
      document.removeEventListener("mouseout", sair);
      document.removeEventListener("pointerdown", tocar);
      document.removeEventListener("mousedown", pressionar);
      document.removeEventListener("focusin", focar);
      document.removeEventListener("focusout", desfocar);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", soltar, true);
    };
  }, [ativa]);

  if (!ativa || !dica) return null;
  return createPortal(
    <div
      role="tooltip"
      style={{
        left: Math.min(Math.max(dica.x, 16), window.innerWidth - 16),
        top: dica.y,
        transform: `translate(-50%, ${dica.embaixo ? "0" : "-100%"})`,
      }}
      className="pointer-events-none fixed z-[60] max-w-[min(360px,calc(100vw-2rem))] rounded-md bg-fg px-2.5 py-1.5 text-fs-2 leading-snug font-medium text-surface shadow-lg whitespace-pre-line break-words c41-dica-in"
    >
      {dica.texto}
    </div>,
    document.body
  );
}
