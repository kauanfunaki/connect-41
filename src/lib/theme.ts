// Preferência de tema do usuário. Vive num cookie (não no banco) porque
// precisa ser aplicada no <html> antes do primeiro paint, ainda no servidor —
// o layout raiz lê o cookie e já renderiza com data-theme certo, evitando o
// flash de tema claro.
//
// Só pode ser chamado no cliente (toca em `document`). Dois componentes usam:
// o botão da topbar (ThemeToggle) e o cartão de "Aparência" em
// /configuracoes (TemaSelector).

export type Theme = "light" | "dark";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(next: Theme): void {
  document.documentElement.setAttribute("data-theme", next);
  document.cookie = `theme=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}
