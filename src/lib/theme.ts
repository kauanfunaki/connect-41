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
//
// Sem cookie, cada lado tem o seu padrão. A equipe fica no claro, como sempre.
// O portal do cliente segue o aparelho (escolha do Kauan na página de
// decisões, 08/10/2026): o cliente não tinha onde escolher e via sempre o
// claro, mesmo com o celular no escuro. Quem já tem `theme=light|dark|system`
// continua exatamente como estava, nos dois lados.

export type Theme = "light" | "dark";
export type PreferenciaDeTema = Theme | "system";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Sem escolha gravada, esta rota segue o aparelho? Só o portal do cliente.
 *
 * O mesmo critério de `ehCaminhoDoPortal` (lib/auth/portal.ts) — o segmento
 * inteiro, para `/portalzinho` não contar. Repetido aqui porque este arquivo
 * roda no navegador, e aquele importa `next/headers`.
 */
export function semEscolhaSegueOAparelho(pathname: string): boolean {
  return pathname === "/portal" || pathname.startsWith("/portal/");
}

export function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function readPreferencia(): PreferenciaDeTema {
  if (typeof document === "undefined") return "light";
  const valor = /(?:^|; )theme=(\w+)/.exec(document.cookie)?.[1];
  if (valor === "system" || valor === "dark" || valor === "light") return valor;
  return semEscolhaSegueOAparelho(window.location.pathname) ? "system" : readTheme();
}

function temaDoAparelho(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const EVENTO_DO_TEMA = "c41-tema";

export function applyPreferencia(next: PreferenciaDeTema): void {
  document.cookie = `theme=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  document.documentElement.setAttribute("data-theme", next === "system" ? temaDoAparelho() : next);
  // A escolha que não muda o `data-theme` (escuro → "do aparelho", com o
  // aparelho no escuro) também avisa quem mostra a preferência.
  window.dispatchEvent(new Event(EVENTO_DO_TEMA));
}

/**
 * O tema como store do `useSyncExternalStore` (Ajustes 15/10, G5). Avisa
 * quando o `data-theme` do <html> muda — o botão, as configurações, o script
 * do <head> seguindo o aparelho — ou quando a preferência é gravada.
 *
 * É o store, e não um `useState(readTheme)`, que conserta o botão no tema
 * errado: o servidor não tem DOM e desenhava o "claro"; o cliente começava já
 * no "escuro" e, no React 19, a hidratação não corrige atributo divergente —
 * o botão ficava no claro até o primeiro clique. Com o store, a hidratação usa
 * o valor do servidor e o React troca para o do navegador logo em seguida.
 */
export function assinarTema(aviso: () => void): () => void {
  const observador = new MutationObserver(aviso);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener(EVENTO_DO_TEMA, aviso);
  return () => {
    observador.disconnect();
    window.removeEventListener(EVENTO_DO_TEMA, aviso);
  };
}

/** Escolha explícita de claro/escuro (o botão da topbar). */
export function applyTheme(next: Theme): void {
  applyPreferencia(next);
}

/**
 * Roda no <head>, antes da pintura. Só age quando o tema segue o aparelho —
 * cookie `theme=system`, ou nenhum cookie numa rota do portal
 * (`semEscolhaSegueOAparelho`): resolve o tema pelo aparelho e fica ouvindo a
 * troca. O cookie é relido a cada troca, para parar de seguir se a pessoa
 * escolher claro ou escuro — e para passar a seguir, sem recarregar, quem
 * escolheu "do aparelho" com a tela aberta.
 *
 * Com `theme=light|dark`, ou sem cookie fora do portal, não muda nada: vale o
 * `data-theme` que o servidor já pôs no <html>.
 */
export const SCRIPT_DO_TEMA = `(function(){try{var q=window.matchMedia("(prefers-color-scheme: dark)");var s=function(){var c=/(?:^|; )theme=(\\w+)/.exec(document.cookie);if(c)return c[1]==="system";var p=location.pathname;return p==="/portal"||p.indexOf("/portal/")===0};var a=function(){if(s())document.documentElement.setAttribute("data-theme",q.matches?"dark":"light")};a();q.addEventListener("change",a)}catch(e){}})();`;
