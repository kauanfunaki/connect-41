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

const FOCAVEL = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

// Dropdown genérico: trigger + painel em surface-elevated, fecha ao clicar fora.
//
// Desde 07/10/2026 fecha também com Esc (o Popover já fechava), devolvendo o
// foco ao gatilho, e o gatilho anuncia se está aberto (`aria-expanded`). O
// gatilho é de quem chama (render prop), então o atributo é posto aqui, no
// primeiro elemento focável dele — assim os botões Filtros, ⋯ da ficha, perfil
// e ajuda ganham o estado sem cada tela repetir.
export function Dropdown({ trigger, children, align = "left", width = 240, alturaMaxima = "max-h-[360px]" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLSpanElement>(null);
  // Clique num painel flutuante aberto daqui de dentro (o calendário do campo
  // de data, que vai para o `body` por portal) não é clique fora: o evento do
  // React atravessa o portal e marca isto antes de chegar no `document`.
  const dentro = useRef(false);

  useEffect(() => {
    gatilhoRef.current?.querySelector(FOCAVEL)?.setAttribute("aria-expanded", String(open));
  });

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
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Marca o Esc como usado, como o Popover: quem está embaixo (o chat de
      // IA, um modal) não fecha junto.
      e.preventDefault();
      const focoDentro = rootRef.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (focoDentro) gatilhoRef.current?.querySelector<HTMLElement>(FOCAVEL)?.focus();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", tecla);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative block"
      onMouseDown={() => {
        dentro.current = true;
      }}
    >
      <span ref={gatilhoRef} className="contents">
        {trigger({ open, toggle: () => setOpen((v) => !v) })}
      </span>
      {open && (
        <div
          style={{ width }}
          className={`c41-surgir scroll-y absolute top-[calc(100%+10px)] max-w-[calc(100vw-2rem)] ${
            align === "right" ? "right-0" : "left-0"
          } bg-surface-elevated border border-border-strong rounded-lg shadow-lg p-3 z-20 ${alturaMaxima} overflow-y-auto text-dropdown`}
        >
          {typeof children === "function" ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}

// O mesmo desenho do `ItemDoMenu` (ui/Popover), como o comentário de lá
// prometia: `rounded-md`, o raio de controle. Era `rounded-lg` (16px, raio de
// cartão), de quando o `lg` valia 8px (07/10/2026).
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
      className={`w-full text-left px-2 py-2 rounded-md text-dropdown font-medium transition-colors ${
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
