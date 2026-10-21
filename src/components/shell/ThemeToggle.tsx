"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { applyTheme, assinarTema, readPreferencia, readTheme, type Theme } from "@/lib/theme";

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
  // O tema do <html>, pelo store (`assinarTema`): o servidor desenha o claro,
  // e o React troca para o do navegador logo depois de hidratar.
  const theme = useSyncExternalStore<Theme>(assinarTema, readTheme, () => "light");
  const doSistema = useSyncExternalStore(assinarTema, () => readPreferencia() === "system", () => false);

  function apply(next: Theme) {
    if (next === theme && !doSistema) return;
    applyTheme(next);
  }

  const estado = `Tema ${ROTULO[theme]}${doSistema ? " (segue o aparelho)" : ""}`;

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      data-dica={estado}
      className="relative inline-flex items-center h-[38px] p-[4px] rounded-full bg-surface-hover border border-border"
    >
      {/* O indicador que desliza: é ele que diz, de longe, qual tema vale. */}
      <span
        aria-hidden
        className={`absolute top-[4px] left-[4px] size-[28px] rounded-full bg-brand-solid shadow-xs transition-transform duration-200 ease-out motion-reduce:transition-none ${
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
