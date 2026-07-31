"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Claro", icon: <Sun size={16} /> },
  { value: "dark", label: "Escuro", icon: <Moon size={16} /> },
];

// Mesma preferência do botão de tema da topbar (cookie `theme`, aplicado no
// <html> antes do hidrate) — aqui só em formato de cartão, com rótulo, pra
// quem procura a opção em "Configurações" e não no ícone do cabeçalho.
export function TemaSelector() {
  // O servidor não tem DOM e sempre renderiza assumindo "light"; no cliente o
  // valor real vem do atributo já aplicado no <html>. Daí o
  // suppressHydrationWarning — o cliente vence de propósito.
  const [theme, setTheme] = useState<Theme>(readTheme);

  function apply(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-2 gap-3 max-w-sm">
      {OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => apply(o.value)}
            suppressHydrationWarning
            className={`flex items-center gap-2.5 px-3.5 h-11 rounded-lg border text-[13px] font-medium transition-colors ${
              active
                ? "border-brand bg-brand-subtle text-brand"
                : "border-border-strong bg-surface-hover text-fg-secondary hover:text-fg hover:border-brand/40"
            }`}
          >
            <span className="flex-shrink-0">{o.icon}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
