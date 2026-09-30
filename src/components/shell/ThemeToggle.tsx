"use client";

import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { applyTheme, readPreferencia, readTheme, type Theme } from "@/lib/theme";

const ROTULO: Record<Theme, string> = { light: "claro", dark: "escuro" };

/**
 * O seletor de tema da topbar, como um interruptor: uma bolinha na cor da
 * marca fica atrás do tema ativo, com o ícone dele em branco; o outro fica
 * apagado.
 *
 * Era um par de ícones em que o ativo só ganhava fundo branco sobre cinza
 * claro — o Kauan clicava no claro com o claro já ligado (30/09), porque não
 * dava para ver qual estava valendo. A dica diz o estado em palavras, e
 * clicar no que já está ativo não faz nada.
 */
export function ThemeToggle() {
  // O servidor não tem acesso ao DOM, então sempre renderiza assumindo "light";
  // no client o valor real (vindo do cookie, já aplicado no <html> antes do
  // hidrate) pode ser "dark" — daí o suppressHydrationWarning abaixo, padrão
  // recomendado pra widgets de tema (o client sempre vence, de propósito).
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [doSistema, setDoSistema] = useState(() => readPreferencia() === "system");

  function apply(next: Theme) {
    if (next === theme && !doSistema) return;
    setTheme(next);
    setDoSistema(false);
    applyTheme(next);
  }

  const estado = `Tema ${ROTULO[theme]}${doSistema ? " (segue o aparelho)" : ""}`;

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      data-dica={estado}
      suppressHydrationWarning
      className="relative inline-flex items-center h-[38px] p-[4px] rounded-full bg-surface-hover border border-border"
    >
      {/* O indicador que desliza: é ele que diz, de longe, qual tema vale. */}
      <span
        aria-hidden
        suppressHydrationWarning
        className={`absolute top-[4px] left-[4px] size-[28px] rounded-full bg-brand shadow-[var(--c41-shadow-xs)] transition-transform duration-200 ease-out motion-reduce:transition-none ${
          theme === "dark" ? "translate-x-[30px]" : "translate-x-0"
        }`}
      />
      {(["light", "dark"] as const).map((t) => {
        const ativo = theme === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={`Tema ${ROTULO[t]}${ativo ? " (ativo)" : ""}`}
            onClick={() => apply(t)}
            suppressHydrationWarning
            className={`relative z-[1] size-[28px] [&+&]:ml-[2px] inline-flex items-center justify-center rounded-full transition-colors duration-200 ${
              ativo ? "text-on-brand cursor-default" : "text-fg-muted hover:text-fg"
            }`}
          >
            {t === "light" ? <Sun size={15} strokeWidth={ativo ? 2.25 : 2} /> : <Moon size={15} strokeWidth={ativo ? 2.25 : 2} />}
          </button>
        );
      })}
    </div>
  );
}
