"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// Um elemento conta como focável se ocupa espaço na tela. Não dá pra usar
// `offsetParent !== null` aqui: o painel do SlideOver é `position: fixed`, e
// fixed sempre tem offsetParent nulo — todo o conteúdo seria descartado.
function isVisible(el: HTMLElement) {
  return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
}

/**
 * Comportamento de diálogo modal compartilhado por `Modal` e `SlideOver`:
 * fecha no ESC, prende o Tab dentro do painel, move o foco pra dentro ao
 * abrir, devolve o foco pro gatilho ao fechar e trava o scroll do body.
 *
 * Devolve a ref que deve ir no elemento do painel — que também precisa de
 * `role="dialog"`, `aria-modal="true"` e `tabIndex={-1}`.
 */
export function useDialog(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);

  // `onClose` fica numa ref pra sair das dependências do efeito abaixo. Se
  // entrasse nelas, todo consumidor que passa uma arrow inline (ou que troca
  // de handler conforme o estado, como o ConfirmDialog quando `pending` muda)
  // faria o efeito desmontar e remontar — o que reabre o scroll, refaz o foco
  // inicial e tira o cursor de onde a pessoa estava.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Foco inicial: primeiro controle do painel; se não houver, o próprio
    // painel (por isso ele precisa de tabIndex={-1}).
    const firstFocusable = Array.from(
      panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).find(isVisible);
    (firstFocusable ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return panelRef;
}
