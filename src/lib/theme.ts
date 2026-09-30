// Preferência de tema do usuário. Vive num cookie (não no banco) porque
// precisa ser aplicada no <html> antes do primeiro paint, ainda no servidor —
// o layout raiz lê o cookie e já renderiza com data-theme certo, evitando o
// flash de tema claro.
//
// Só pode ser chamado no cliente (toca em `document`). Dois componentes usam:
// o botão da topbar (ThemeToggle) e os cartões de "Aparência" em
// /configuracoes (TemaSelector).
//
// "system" (desde 30/09) segue o tema do aparelho. O servidor não sabe qual é,
// então renderiza claro e o script do <head> (SCRIPT_DO_TEMA, no layout raiz)
// troca antes da pintura — e acompanha se o aparelho mudar com a tela aberta.
// O `data-theme` fica sempre resolvido (light/dark): as variantes `dark:` do
// Tailwind leem só ele.

export type Theme = "light" | "dark";
export type PreferenciaDeTema = Theme | "system";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function readPreferencia(): PreferenciaDeTema {
  if (typeof document === "undefined") return "light";
  const valor = /(?:^|; )theme=(\w+)/.exec(document.cookie)?.[1];
  return valor === "system" ? "system" : valor === "dark" ? "dark" : readTheme();
}

function temaDoAparelho(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyPreferencia(next: PreferenciaDeTema): void {
  document.cookie = `theme=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  document.documentElement.setAttribute("data-theme", next === "system" ? temaDoAparelho() : next);
}

/** Escolha explícita de claro/escuro (o botão da topbar). */
export function applyTheme(next: Theme): void {
  applyPreferencia(next);
}

/**
 * Roda no <head>, antes da pintura. Só age quando a preferência é "system":
 * resolve o tema pelo aparelho e fica ouvindo a troca (o cookie é relido a
 * cada troca, para parar de seguir se a pessoa escolher claro ou escuro).
 */
export const SCRIPT_DO_TEMA = `(function(){try{if(!/(?:^|; )theme=system/.test(document.cookie))return;var q=window.matchMedia("(prefers-color-scheme: dark)");var a=function(){if(/(?:^|; )theme=system/.test(document.cookie))document.documentElement.setAttribute("data-theme",q.matches?"dark":"light")};a();q.addEventListener("change",a)}catch(e){}})();`;
