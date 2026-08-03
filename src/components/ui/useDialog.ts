"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  // `type=hidden` nunca recebe foco, mas casa em `input:not([disabled])` — e o
  // RichTextEditor põe um hidden em todo formulário, então sem esta exclusão
  // ele entrava na lista e virava uma parada morta do Tab.
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "summary",
  // O conteúdo do ProseMirror (descrição de tarefa, manual) é um
  // contenteditable sem tabindex: focável de verdade, invisível pro seletor.
  "[contenteditable]:not([contenteditable='false'])",
  // `^="-"` cobre qualquer tabindex negativo, não só o -1 literal.
  '[tabindex]:not([tabindex^="-"])',
].join(",");

// Um elemento conta como focável se está de fato renderizado. Não dá pra usar
// `offsetParent !== null` aqui: o painel do SlideOver é `position: fixed`, e
// fixed sempre tem offsetParent nulo — todo o conteúdo seria descartado.
//
// `getClientRects()` em vez de `offsetWidth/offsetHeight`: pega `display:none`
// (zero retângulos) sem descartar elementos inline ou de dimensão fracionária,
// que podiam medir 0 e sumir da lista. `visibility` precisa de checagem à
// parte — quem está `hidden` continua tendo retângulos.
function isRendered(el: HTMLElement) {
  if (el === document.activeElement) return true;
  if (el.getClientRects().length === 0) return false;
  return getComputedStyle(el).visibility !== "hidden";
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
    ).find(isRendered);
    (firstFocusable ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // Alguém mais fundo já tratou este Tab (editor de texto que indenta
      // lista, combobox que navega opções). Sequestrar o foco aqui atropelaria
      // esse comportamento.
      if (e.defaultPrevented) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isRendered);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      // O ciclo é conduzido por índice, não só por "estou na ponta?". A versão
      // anterior devolvia o Tab pro navegador em qualquer posição do meio — e
      // como o botão de fechar é o primeiro do DOM mas aparece no canto
      // superior direito (`position: absolute`), a ordem nativa não batia com
      // a ordem visual: o foco voltava pro X em vez de seguir pros campos.
      // Também não havia tratamento pra foco fora da lista (no próprio painel,
      // que tem tabIndex={-1}), caso em que o Tab nativo podia escapar do
      // diálogo inteiro.
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next =
        current === -1
          ? e.shiftKey
            ? items.length - 1
            : 0
          : (current + (e.shiftKey ? -1 : 1) + items.length) % items.length;

      e.preventDefault();
      items[next].focus();
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
