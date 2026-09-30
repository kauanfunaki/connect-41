"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

type Props = {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode | ((props: { close: () => void }) => React.ReactNode);
  align?: "left" | "right";
  width?: number;
  /** Nome acessível do painel. */
  "aria-label"?: string;
};

const MARGEM = 8;

/**
 * Painel ancorado que abre **por cima de tudo**, fora da árvore da página.
 *
 * O `Dropdown` é `absolute` dentro do próprio pai, e dentro de uma tabela com
 * rolagem lateral (`TabelaNoDesktop` é `overflow-x-auto`) ele é cortado pela
 * borda do casco. Foi o que aconteceu com a baixa de /pagar em 30/09: a data e
 * o "Confirmar" abriam na célula e empurravam o resto para fora da tela. Aqui o
 * painel vai para o `body` (portal) com posição fixa calculada a partir do
 * botão, e vira para cima quando não cabe embaixo.
 */
export function Popover({ trigger, children, align = "left", width = 240, "aria-label": ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ancoraRef = useRef<HTMLSpanElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const posicionar = useCallback(() => {
    const ancora = ancoraRef.current?.getBoundingClientRect();
    if (!ancora) return;
    const altura = painelRef.current?.offsetHeight ?? 0;
    const largura = Math.min(width, window.innerWidth - MARGEM * 2);
    let left = align === "right" ? ancora.right - largura : ancora.left;
    left = Math.max(MARGEM, Math.min(left, window.innerWidth - largura - MARGEM));
    const cabeEmbaixo = ancora.bottom + 6 + altura <= window.innerHeight - MARGEM;
    const top = cabeEmbaixo || ancora.top - 6 - altura < MARGEM ? ancora.bottom + 6 : ancora.top - 6 - altura;
    setPos({ top, left });
  }, [align, width]);

  // Duas passadas: a primeira põe o painel na tela para medir a altura, a
  // segunda decide se ele vira para cima. Antes da pintura, então a posição
  // da abertura anterior nunca chega a aparecer.
  useLayoutEffect(() => {
    if (!open) return;
    posicionar();
    const id = requestAnimationFrame(posicionar);
    return () => cancelAnimationFrame(id);
  }, [open, posicionar]);

  useEffect(() => {
    if (!open) return;
    function fora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (ancoraRef.current?.contains(alvo) || painelRef.current?.contains(alvo)) return;
      setOpen(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Rolar a página com o painel aberto o deixaria solto no ar: acompanha.
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("scroll", posicionar, true);
      window.removeEventListener("resize", posicionar);
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [open, posicionar]);

  return (
    <>
      <span ref={ancoraRef} className="inline-flex">
        {trigger({ open, toggle: () => setOpen((v) => !v) })}
      </span>
      {open &&
        createPortal(
          <div
            ref={painelRef}
            role="dialog"
            aria-label={ariaLabel}
            style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="fixed z-50 bg-surface-elevated border border-border-strong rounded-lg shadow-[var(--c41-shadow-lg)] p-3 text-left text-[length:var(--fs-dropdown)]"
          >
            {typeof children === "function" ? children({ close }) : children}
          </div>,
          document.body
        )}
    </>
  );
}

/** Item de menu dentro do `Popover` — mesmo desenho do `DropdownItem`, com ícone. */
export function ItemDoMenu({
  onClick,
  href,
  icone,
  danger = false,
  disabled = false,
  children,
}: {
  onClick?: () => void;
  href?: string;
  icone?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls = `w-full flex items-center gap-2 text-left px-2 py-2 rounded-md text-[length:var(--fs-dropdown)] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${
    danger ? "text-danger hover:bg-danger-bg" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
  }`;
  const conteudo = (
    <>
      {icone && <span className="flex-shrink-0 text-fg-muted [&>svg]:w-3.5 [&>svg]:h-3.5">{icone}</span>}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {conteudo}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {conteudo}
    </button>
  );
}
