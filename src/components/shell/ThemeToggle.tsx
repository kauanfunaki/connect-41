"use client";

import { useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light"
  );

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
