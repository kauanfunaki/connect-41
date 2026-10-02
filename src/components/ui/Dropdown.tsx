"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode | ((props: { close: () => void }) => React.ReactNode);
  align?: "left" | "right";
  width?: number;
  /** Teto de altura do painel (padrão `max-h-[360px]`). O menu do usuário usa a
   *  altura da tela: com muitos setores, o Sair ficava escondido na rolagem. */
  alturaMaxima?: string;
};

// Dropdown genérico: trigger + painel em surface-elevated, fecha ao clicar fora.
export function Dropdown({ trigger, children, align = "left", width = 240, alturaMaxima = "max-h-[360px]" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Clique num painel flutuante aberto daqui de dentro (o calendário do campo
  // de data, que vai para o `body` por portal) não é clique fora: o evento do
  // React atravessa o portal e marca isto antes de chegar no `document`.
  const dentro = useRef(false);

  useEffect(() => {
    if (!open) return;
    // O mousedown que abriu o painel também marcou; não vale para o próximo.
    dentro.current = false;
    function onClickOutside(e: MouseEvent) {
      const foiDentro = dentro.current;
      dentro.current = false;
      if (foiDentro) return;
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative block"
      onMouseDown={() => {
        dentro.current = true;
      }}
    >
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          style={{ width }}
          className={`c41-surgir scroll-y absolute top-[calc(100%+10px)] max-w-[calc(100vw-2rem)] ${
            align === "right" ? "right-0" : "left-0"
          } bg-surface-elevated border border-border-strong rounded-lg shadow-[var(--c41-shadow-lg)] p-3 z-20 ${alturaMaxima} overflow-y-auto text-[length:var(--fs-dropdown)]`}
        >
          {typeof children === "function" ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  onClick,
  danger = false,
  children,
}: {
  onClick?: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-2 py-2 rounded-lg text-[length:var(--fs-dropdown)] font-medium transition-colors ${
        danger ? "text-danger hover:bg-danger-bg" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-border" />;
}
