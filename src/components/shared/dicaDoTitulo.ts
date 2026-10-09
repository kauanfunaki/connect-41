// A regra da dica própria sobre o `title` — sem DOM de verdade, para dar para
// testar: o `HTMLElement` cumpre este tipo, e nos testes um objeto falso também.

/** O que a dica lê e mexe num elemento. */
export type ElementoDaDica = {
  tagName: string;
  textContent: string | null;
  getAttribute(nome: string): string | null;
  setAttribute(nome: string, valor: string): void;
  removeAttribute(nome: string): void;
  hasAttribute(nome: string): boolean;
};

/**
 * O que ganha a dica: quem pede com `data-dica`, todo `title` da interface
 * (08/10/2026 — até ali, só o de dentro de tabela), o texto cortado de tabela e
 * o texto cortado marcado com `c41-cortavel` (o valor dos cartões de total).
 *
 * Fora: o `title` de `<iframe>` (é o nome do quadro, não uma dica), o do campo
 * com `pattern` (é o texto que o navegador mostra quando o formato não bate) e
 * o `title` vazio.
 */
export const SELETOR_DOS_ALVOS =
  '[data-dica], [title]:not([title=""]):not(iframe):not(input[pattern]), table .truncate, .truncate.c41-cortavel';

function temClasse(el: ElementoDaDica, classe: string): boolean {
  return (el.getAttribute("class") ?? "").split(/\s+/).includes(classe);
}

/**
 * O texto da dica, ou `null` quando não há dica. Texto cortado (`.truncate`)
 * só tem dica se o corte existe — a célula que coube inteira não precisa
 * repetir o que já está à vista; `cortado` só é chamado nesse caso (ler a
 * largura custa um cálculo de layout).
 */
export function textoDaDica(el: ElementoDaDica, cortado: () => boolean): string | null {
  const dica = el.getAttribute("data-dica");
  if (dica) return dica;
  const titulo = el.getAttribute("title");
  if (temClasse(el, "truncate")) return cortado() ? titulo || el.textContent?.trim() || null : null;
  return titulo || null;
}

const CAMPOS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/**
 * O elemento tem nome sem o `title`? Rótulo ARIA, texto dentro, ou é campo de
 * formulário (o nome vem do `<label>`). Sem isso, o `title` era o nome — o
 * botão só de ícone.
 */
function temNomeProprio(el: ElementoDaDica): boolean {
  if (el.getAttribute("aria-label")?.trim()) return true;
  if (el.getAttribute("aria-labelledby")?.trim()) return true;
  if (CAMPOS.has(el.tagName.toUpperCase())) return true;
  return Boolean(el.textContent?.trim());
}

/** O que foi tirado e posto no elemento enquanto a dica está aberta. */
export type TituloGuardado = { titulo: string; rotuloPosto: boolean; descricaoPosta: boolean };

/**
 * Tira o `title` enquanto a dica própria está aberta (senão sai também o balão
 * do sistema), sem tirar o que ele dizia ao leitor de tela — a dica abre no
 * foco do teclado, e é justo aí que o leitor lê o nome do botão:
 * - era o nome (botão só de ícone, sem `aria-label`) → vira `aria-label`;
 * - era a descrição (o elemento já tem nome) → vira `aria-description`, a não
 *   ser que já haja descrição ou que repita o nome.
 */
export function suspenderTitulo(el: ElementoDaDica): TituloGuardado | null {
  const titulo = el.getAttribute("title");
  if (titulo === null) return null;
  el.removeAttribute("title");
  const guardado: TituloGuardado = { titulo, rotuloPosto: false, descricaoPosta: false };
  const texto = titulo.trim();
  if (!texto) return guardado;
  if (!temNomeProprio(el)) {
    el.setAttribute("aria-label", titulo);
    guardado.rotuloPosto = true;
  } else {
    const nome = (el.getAttribute("aria-label") ?? "").trim().toLowerCase();
    const jaDescrito = el.hasAttribute("aria-description") || el.hasAttribute("aria-describedby");
    if (!jaDescrito && nome !== texto.toLowerCase()) {
      el.setAttribute("aria-description", titulo);
      guardado.descricaoPosta = true;
    }
  }
  return guardado;
}

/**
 * Devolve o `title` e tira o que foi posto no lugar. Se o React escreveu um
 * `title` novo enquanto a dica estava aberta (o rótulo mudou com o estado),
 * fica o novo.
 */
export function devolverTitulo(el: ElementoDaDica, guardado: TituloGuardado): void {
  if (guardado.rotuloPosto && el.getAttribute("aria-label") === guardado.titulo) el.removeAttribute("aria-label");
  if (guardado.descricaoPosta && el.getAttribute("aria-description") === guardado.titulo) el.removeAttribute("aria-description");
  if (!el.hasAttribute("title")) el.setAttribute("title", guardado.titulo);
}
