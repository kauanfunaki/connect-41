"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";

type Props = {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode | ((props: { close: () => void }) => React.ReactNode);
  align?: "left" | "right";
  width?: number;
  /** Nome acessível do painel. */
  "aria-label"?: string;
};

/**
 * Painel ancorado que abre **por cima de tudo**, fora da árvore da página.
 *
 * O `Dropdown` é `absolute` dentro do próprio pai, e dentro de uma tabela com
 * rolagem lateral (`TabelaNoDesktop` é `overflow-x-auto`) ele é cortado pela
 * borda do casco. Foi o que aconteceu com a baixa de /pagar em 30/09: a data e
 * o "Confirmar" abriam na célula e empurravam o resto para fora da tela. Aqui o
 * painel vai para o `body` (portal) com posição fixa calculada a partir do
 * botão, e vira para cima quando não cabe embaixo — desde 02/10/2026 pelo
 * `PainelFlutuante`, que o calendário do campo de data também usa.
 */
export function Popover({ trigger, children, align = "left", width = 240, "aria-label": ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const ancoraRef = useRef<HTMLSpanElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Marca o Esc como usado: quem está embaixo (o chat de IA, que escuta na
      // janela) não fecha junto. Conferir o painel na tela não serve — o React
      // já o tirou quando o evento chega lá.
      e.preventDefault();
      setOpen(false);
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [open]);

  return (
    <>
      <span ref={ancoraRef} className="inline-flex">
        {trigger({ open, toggle: () => setOpen((v) => !v) })}
      </span>
      <PainelFlutuante
        ancora={ancoraRef}
        aberto={open}
        onFechar={close}
        largura={width}
        align={align}
        aria-label={ariaLabel}
        className="p-3 text-[length:var(--fs-dropdown)]"
      >
        {typeof children === "function" ? children({ close }) : children}
      </PainelFlutuante>
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
