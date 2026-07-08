"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  width?: number;
};

// Dropdown genérico: trigger + painel em surface-elevated, fecha ao clicar fora.
export function Dropdown({ trigger, children, align = "left", width = 240 }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative block">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          style={{ width }}
          className={`scroll-y absolute top-[calc(100%+10px)] ${
            align === "right" ? "right-0" : "left-0"
          } bg-surface-elevated border border-border-strong rounded-2xl shadow-[var(--c41-shadow-lg)] p-3 z-20 max-h-[360px] overflow-y-auto text-[length:var(--fs-dropdown)]`}
        >
          {children}
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
