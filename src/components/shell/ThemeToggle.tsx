"use client";

import { useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  // O servidor não tem acesso ao DOM, então sempre renderiza assumindo "light";
  // no client o valor real (vindo do cookie, já aplicado no <html> antes do
  // hidrate) pode ser "dark" — daí o suppressHydrationWarning abaixo, padrão
  // recomendado pra widgets de tema (o client sempre vence, de propósito).
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light"
  );

  function apply(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex items-center gap-0.5 p-[3px] rounded-[10px] bg-surface-hover border border-border"
    >
      <button
        type="button"
        role="radio"
        aria-checked={theme === "light"}
        title="Tema claro"
        onClick={() => apply("light")}
        suppressHydrationWarning
        className={`w-[30px] h-[30px] inline-flex items-center justify-center rounded-lg transition-colors ${
          theme === "light" ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg-secondary"
        }`}
      >
        <Sun size={15} />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={theme === "dark"}
        title="Tema escuro"
        onClick={() => apply("dark")}
        suppressHydrationWarning
        className={`w-[30px] h-[30px] inline-flex items-center justify-center rounded-lg transition-colors ${
          theme === "dark" ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg-secondary"
        }`}
      >
        <Moon size={15} />
      </button>
    </div>
  );
}
