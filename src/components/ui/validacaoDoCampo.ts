// O miolo da validação própria dos formulários (08/10/2026), sem React: a
// mensagem de cada campo, onde o balão fica, quem recebe o foco e como
// distinguir o `checkValidity()` (que só pergunta) do envio e do
// `reportValidity()` (que mostram o erro). Separado do componente
// `ValidacaoDosFormularios` para ser testado sem navegador.

type Validade = Pick<
  ValidityState,
  | "valid"
  | "valueMissing"
  | "typeMismatch"
  | "patternMismatch"
  | "tooLong"
  | "tooShort"
  | "rangeUnderflow"
  | "rangeOverflow"
  | "stepMismatch"
  | "badInput"
  | "customError"
>;

/** O que a mensagem precisa saber do campo — `<input>`, `<select>` ou `<textarea>`. */
export type CampoValidavel = {
  tagName: string;
  type?: string;
  value?: string;
  title?: string;
  minLength?: number;
  maxLength?: number;
  min?: string;
  max?: string;
  validationMessage: string;
  validity: Validade;
};

// "0.5" → "0,5"; "2026-10-08" → "08/10/2026". O limite aparece como a pessoa
// escreve, não como o atributo guarda.
function limite(valor: string | undefined): string {
  const v = (valor ?? "").trim();
  const data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (data) return `${data[3]}/${data[2]}/${data[1]}`;
  return /^-?\d+(\.\d+)?$/.test(v) ? v.replace(".", ",") : v;
}

/**
 * A mensagem do balão, em português e no tom do Connect, para cada motivo do
 * `validity`. O erro posto por `setCustomValidity` (campos de data, regras da
 * tela) vale como veio. A mensagem do navegador (`validationMessage`) muda com
 * o idioma dele — um Chrome em inglês diria "Please fill out this field." no
 * meio da tela em português —, então só serve de última opção.
 */
export function mensagemDoCampo(campo: CampoValidavel): string {
  const v = campo.validity;
  const tag = campo.tagName.toUpperCase();
  const tipo = (campo.type ?? "").toLowerCase();
  const tamanho = campo.value?.length ?? 0;
  if (v.customError && campo.validationMessage) return campo.validationMessage;
  if (v.badInput) return tipo === "number" ? "Digite só números." : "Valor inválido.";
  if (v.valueMissing) {
    if (tag === "SELECT") return "Escolha uma opção da lista.";
    if (tipo === "checkbox") return "Marque esta opção para continuar.";
    if (tipo === "radio") return "Escolha uma das opções.";
    if (tipo === "file") return "Escolha um arquivo.";
    return "Preencha este campo.";
  }
  if (v.typeMismatch) {
    if (tipo === "email") return "Digite um e-mail válido, como nome@empresa.com.br.";
    if (tipo === "url") return "Digite o endereço completo, começando com https://.";
    return "Valor em formato inválido.";
  }
  if (v.patternMismatch) return campo.title?.trim() || "Use o formato pedido.";
  if (v.tooLong) return `Use no máximo ${campo.maxLength} caracteres (agora são ${tamanho}).`;
  if (v.tooShort) return `Use pelo menos ${campo.minLength} caracteres (agora são ${tamanho}).`;
  if (v.rangeUnderflow) return `O mínimo é ${limite(campo.min)}.`;
  if (v.rangeOverflow) return `O máximo é ${limite(campo.max)}.`;
  if (v.stepMismatch) return "Use um valor válido para este campo.";
  return campo.validationMessage || "Confira este campo.";
}

/**
 * Quem recebe o foco e o balão. O `Select` guarda o valor num `<select>`
 * escondido (é ele que fica inválido) e aponta, no `data-c41-foco`, o id do
 * gatilho que a pessoa vê.
 */
export function alvoDoCampo<T extends { getAttribute(nome: string): string | null }>(
  campo: T,
  buscar: (id: string) => T | null
): T {
  const id = campo.getAttribute("data-c41-foco");
  return (id && buscar(id)) || campo;
}

type ComRetangulo = { parentElement: ComRetangulo | null; getBoundingClientRect(): { width: number; height: number } };

/** O próprio elemento ou, se ele não ocupa espaço na tela, o primeiro ancestral que ocupa. */
export function ancoraVisivel<T extends ComRetangulo>(el: T): T {
  for (let atual: ComRetangulo | null = el; atual; atual = atual.parentElement) {
    const r = atual.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return atual as T;
  }
  return el;
}

/** Campo onde se digita: lá o balão só some quando o texto fica certo. */
export function ehCampoDeTexto(el: { tagName: string; type?: string; isContentEditable?: boolean }): boolean {
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || el.isContentEditable) return true;
  if (tag !== "INPUT") return false;
  return !["checkbox", "radio", "button", "submit", "reset", "file", "color", "range", "image", "hidden"].includes(
    (el.type ?? "text").toLowerCase()
  );
}

const MARGEM = 8;
const DISTANCIA = 8;

/**
 * Onde o balão fica: embaixo do campo, alinhado à esquerda dele, ou em cima
 * quando não cabe embaixo (campo no pé da tela, teclado do celular aberto).
 * `seta` é a distância, a partir da esquerda do balão, da ponta que aponta
 * para o campo.
 */
export function posicaoDoBalao(
  campo: { top: number; bottom: number; left: number; width: number },
  balao: { largura: number; altura: number },
  tela: { largura: number; altura: number }
): { top: number; left: number; emCima: boolean; seta: number } {
  const largura = Math.min(balao.largura, tela.largura - MARGEM * 2);
  const left = Math.max(MARGEM, Math.min(campo.left, tela.largura - largura - MARGEM));
  const cabeEmbaixo = campo.bottom + DISTANCIA + balao.altura <= tela.altura - MARGEM;
  const cabeEmCima = campo.top - DISTANCIA - balao.altura >= MARGEM;
  const emCima = !cabeEmbaixo && cabeEmCima;
  const top = emCima ? campo.top - DISTANCIA - balao.altura : campo.bottom + DISTANCIA;
  const pontaNoCampo = campo.left + Math.min(20, campo.width / 2);
  const seta = Math.max(12, Math.min(pontaNoCampo - left, largura - 12));
  return { top, left, emCima, seta };
}

// O `checkValidity()` também dispara `invalid`, mas só pergunta — o navegador
// não mostra nada, e nós também não. O estado fica no `globalThis` para valer
// entre recargas do módulo no desenvolvimento.
const CHAVE = Symbol.for("c41.validacaoSilenciosa");
type Estado = { silencio: number };
function estado(): Estado {
  const g = globalThis as { [CHAVE]?: Estado };
  return (g[CHAVE] ??= { silencio: 0 });
}

/** Está dentro de um `checkValidity()`? */
export function emValidacaoSilenciosa(): boolean {
  return estado().silencio > 0;
}

function prototiposNativos(): object[] {
  if (typeof window === "undefined") return [];
  return [
    window.HTMLFormElement,
    window.HTMLInputElement,
    window.HTMLSelectElement,
    window.HTMLTextAreaElement,
    window.HTMLButtonElement,
    window.HTMLFieldSetElement,
    window.HTMLOutputElement,
    window.HTMLObjectElement,
  ]
    .filter(Boolean)
    .map((c) => c.prototype);
}

/**
 * Embrulha o `checkValidity` dos elementos de formulário para marcar a
 * pergunta silenciosa. Uma vez só por protótipo; o resultado é o do original.
 */
export function instalarValidacaoSilenciosa(prototipos: object[] = prototiposNativos()): void {
  for (const proto of prototipos) {
    const p = proto as { checkValidity?: (this: unknown) => boolean; [CHAVE]?: true };
    const original = p.checkValidity;
    if (typeof original !== "function" || p[CHAVE]) continue;
    p.checkValidity = function (this: unknown) {
      estado().silencio++;
      try {
        return original.call(this);
      } finally {
        estado().silencio--;
      }
    };
    p[CHAVE] = true;
  }
}
