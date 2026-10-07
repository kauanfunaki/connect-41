"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** O elemento de onde o painel sai (o campo, o botão). */
  ancora: React.RefObject<HTMLElement | null>;
  aberto: boolean;
  onFechar: () => void;
  /** Largura no desktop; no celular a folha ocupa a largura da tela. */
  largura: number;
  align?: "left" | "right";
  /** No celular, abre como folha presa embaixo, em vez de pendurada no campo. */
  folhaNoCelular?: boolean;
  "aria-label"?: string;
  /** Para o `aria-controls` de quem abre o painel. */
  id?: string;
  role?: string;
  className?: string;
  children: React.ReactNode;
};

const MARGEM = 8;
const CELULAR = "(max-width: 639px)";

function assinarCelular(aviso: () => void) {
  const mq = window.matchMedia(CELULAR);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

/**
 * Painel ancorado que abre **por cima de tudo**, fora da árvore da página
 * (portal no `body`, posição fixa calculada a partir da âncora, vira para cima
 * quando não cabe embaixo). Saiu do `Popover` em 02/10/2026 para o calendário
 * do campo de data usar o mesmo, controlado por fora.
 *
 * Clique dentro do painel não conta como "fora" para quem está em volta: um
 * calendário aberto de dentro do painel de Filtros, de um `Popover` ou de outro
 * `PainelFlutuante` não fecha o de fora. O evento do React atravessa o portal
 * até os ancestrais — é ele que marca `dentro` antes de o `mousedown` chegar
 * no `document`. O mesmo vale para o `Dropdown` (ver `marcaDeCliqueDentro`).
 */
export function PainelFlutuante({
  ancora,
  aberto,
  onFechar,
  largura,
  align = "left",
  folhaNoCelular = false,
  "aria-label": ariaLabel,
  id,
  role = "dialog",
  className = "",
  children,
}: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const dentro = useRef(false);
  const noCelular = useSyncExternalStore(
    assinarCelular,
    () => window.matchMedia(CELULAR).matches,
    () => false
  );
  const comoFolha = folhaNoCelular && noCelular;

  // `onFechar` numa ref: quem passa arrow inline não deve refazer os efeitos.
  const fecharRef = useRef(onFechar);
  useEffect(() => {
    fecharRef.current = onFechar;
  });

  // Duas passadas: a primeira põe o painel na tela para medir a altura, a
  // segunda decide se ele vira para cima. Antes da pintura, então a posição
  // da abertura anterior nunca chega a aparecer. Rolar a página com o painel
  // aberto o deixaria solto no ar: acompanha.
  useLayoutEffect(() => {
    if (!aberto || comoFolha) return;
    const ancoraEl = ancora.current;
    function posicionar() {
      const a = ancoraEl?.getBoundingClientRect();
      if (!a) return;
      const altura = painelRef.current?.offsetHeight ?? 0;
      const w = Math.min(largura, window.innerWidth - MARGEM * 2);
      let left = align === "right" ? a.right - w : a.left;
      left = Math.max(MARGEM, Math.min(left, window.innerWidth - w - MARGEM));
      const cabeEmbaixo = a.bottom + 6 + altura <= window.innerHeight - MARGEM;
      const top = cabeEmbaixo || a.top - 6 - altura < MARGEM ? a.bottom + 6 : a.top - 6 - altura;
      setPos({ top, left });
    }
    posicionar();
    const id = requestAnimationFrame(posicionar);
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", posicionar, true);
      window.removeEventListener("resize", posicionar);
    };
  }, [aberto, comoFolha, ancora, largura, align]);

  useEffect(() => {
    if (!aberto) return;
    dentro.current = false;
    const ancoraEl = ancora.current;
    function fora(e: MouseEvent) {
      const foiDentro = dentro.current;
      dentro.current = false;
      if (foiDentro || ancoraEl?.contains(e.target as Node)) return;
      fecharRef.current();
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto, ancora]);

  if (!aberto) return null;

  const marcar = () => {
    dentro.current = true;
  };

  if (comoFolha) {
    return createPortal(
      <div data-c41-flutuante="" onMouseDown={marcar} className="fixed inset-0 z-[60] flex flex-col justify-end">
        <div className="c41-esmaecer absolute inset-0 bg-black/40" onClick={() => fecharRef.current()} aria-hidden />
        <div
          ref={painelRef}
          id={id}
          role={role}
          aria-label={ariaLabel}
          className={`c41-folha relative bg-surface-elevated border-t border-border-strong rounded-t-lg shadow-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] ${className}`}
        >
          {children}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={painelRef}
      data-c41-flutuante=""
      id={id}
      role={role}
      aria-label={ariaLabel}
      onMouseDown={marcar}
      style={{ width: Math.min(largura, typeof window === "undefined" ? largura : window.innerWidth - MARGEM * 2), top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={`c41-surgir fixed z-[60] bg-surface-elevated border border-border-strong rounded-lg shadow-lg text-left ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}
