import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { normalizar } from "@/lib/buscaDeTelas";

// O miolo do `Select` (08/10/2026), sem DOM nem React de estado: ler as
// opções dos `children`, decidir qual aparece no campo, filtrar pela busca,
// andar com o teclado e trocar o valor do `<select>` escondido. Separado do
// componente para ser testado sem navegador.

export type OpcaoDoSelect = {
  valor: string;
  rotulo: string;
  desabilitada: boolean;
  /** `hidden` no `<option>`: vale como valor, mas não aparece na lista. */
  oculta: boolean;
  /** Rótulo do `<optgroup>` em volta, ou `null`. */
  grupo: string | null;
  /** Posição entre os `<option>` do `<select>` — o `selectedIndex` dela. */
  indice: number;
};

/** Acima disto, a lista ganha busca. */
export const LIMITE_SEM_BUSCA = 8;

type PropsDeOpcao = {
  value?: unknown;
  label?: unknown;
  disabled?: boolean;
  hidden?: boolean;
  children?: ReactNode;
};

function textoDe(no: ReactNode): string {
  if (no == null || typeof no === "boolean") return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "bigint") return String(no);
  if (Array.isArray(no)) return no.map(textoDe).join("");
  if (isValidElement<{ children?: ReactNode }>(no)) return textoDe(no.props.children);
  return "";
}

// O navegador mostra o texto da opção com os espaços colapsados, e é com esse
// texto que ele preenche o valor de quem não tem `value`.
function colapsar(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/**
 * As opções na ordem do `<select>`: `<option>` soltos, dentro de `<optgroup>`,
 * de fragmentos e de listas de `map`; `false`/`null` ficam de fora. As regras
 * são as do HTML: sem `value`, o valor é o texto; `label` vence o texto; grupo
 * desabilitado desabilita as suas opções.
 */
export function lerOpcoes(children: ReactNode): OpcaoDoSelect[] {
  const opcoes: OpcaoDoSelect[] = [];
  function visitar(nos: ReactNode, grupo: string | null, grupoDesabilitado: boolean) {
    Children.forEach(nos, (no) => {
      if (!isValidElement<PropsDeOpcao>(no)) return;
      const props = no.props;
      if (no.type === Fragment) {
        visitar(props.children, grupo, grupoDesabilitado);
      } else if (no.type === "optgroup") {
        visitar(props.children, colapsar(String(props.label ?? "")), grupoDesabilitado || Boolean(props.disabled));
      } else if (no.type === "option") {
        const texto = colapsar(textoDe(props.children));
        const rotulo = props.label != null && String(props.label) !== "" ? colapsar(String(props.label)) : texto;
        opcoes.push({
          valor: props.value != null ? String(props.value) : texto,
          rotulo,
          desabilitada: grupoDesabilitado || Boolean(props.disabled),
          oculta: Boolean(props.hidden),
          grupo,
          indice: opcoes.length,
        });
      }
    });
  }
  visitar(children, null, false);
  return opcoes;
}

/** O `value`/`defaultValue` do React como o `<select>` o compara: texto. */
export function paraTexto(valor: unknown): string | undefined {
  if (valor == null) return undefined;
  if (Array.isArray(valor)) return valor.length ? String(valor[0]) : "";
  return String(valor);
}

/**
 * A opção que o `<select>` mostra para um valor — a mesma conta do React
 * (`updateOptions`): a primeira com aquele valor, mesmo desabilitada (o
 * "Selecione…" desabilitado com `defaultValue=""`); sem nenhuma, a primeira
 * habilitada, como o navegador faz.
 */
export function opcaoMostrada(opcoes: OpcaoDoSelect[], valor: string | undefined): OpcaoDoSelect | null {
  if (valor !== undefined) {
    const achada = opcoes.find((o) => o.valor === valor);
    if (achada) return achada;
  }
  return opcoes.find((o) => !o.desabilitada) ?? null;
}

/**
 * Entra na lista do painel? A opção oculta não, e nem o "Selecione…"
 * desabilitado de valor vazio: no campo ele é o texto apagado; na lista seria
 * uma linha cinza que não se escolhe.
 */
export function naLista(o: OpcaoDoSelect): boolean {
  return !o.oculta && !(o.desabilitada && o.valor === "");
}

/** Busca sem acento e sem caixa, pelo rótulo ou pelo grupo da opção. */
export function filtrarOpcoes<T extends Pick<OpcaoDoSelect, "rotulo" | "grupo">>(opcoes: T[], termo: string): T[] {
  const t = normalizar(termo);
  if (!t) return opcoes;
  return opcoes.filter((o) => normalizar(o.rotulo).includes(t) || (o.grupo !== null && normalizar(o.grupo).includes(t)));
}

/** Opções seguidas do mesmo grupo, para desenhar o cabeçalho uma vez só. */
export function agruparEmSecoes<T extends Pick<OpcaoDoSelect, "grupo">>(
  opcoes: T[]
): { grupo: string | null; itens: { opcao: T; posicao: number }[] }[] {
  const secoes: { grupo: string | null; itens: { opcao: T; posicao: number }[] }[] = [];
  opcoes.forEach((opcao, posicao) => {
    const ultima = secoes.at(-1);
    if (ultima && ultima.grupo === opcao.grupo) ultima.itens.push({ opcao, posicao });
    else secoes.push({ grupo: opcao.grupo, itens: [{ opcao, posicao }] });
  });
  return secoes;
}

/**
 * Anda `passo` posições (±1 nas setas, ±10 no PageUp/PageDown) e cai na
 * habilitada mais próxima nessa direção; na ponta, para. `atual = -1` começa
 * de fora: `passo > 0` dá a primeira habilitada (Home), `passo < 0` a última
 * (End). Sem nenhuma habilitada no caminho, fica onde está.
 */
export function moverAtiva(opcoes: Pick<OpcaoDoSelect, "desabilitada">[], atual: number, passo: number): number {
  const n = opcoes.length;
  if (n === 0) return -1;
  const direcao = passo < 0 ? -1 : 1;
  const inicio = atual < 0 ? (direcao > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, atual + passo));
  for (let i = inicio; i >= 0 && i < n; i += direcao) if (!opcoes[i]!.desabilitada) return i;
  // Passou da ponta sem achar (as últimas estão desabilitadas): volta até a atual.
  for (let i = inicio - direcao; i !== atual && i >= 0 && i < n; i -= direcao) if (!opcoes[i]!.desabilitada) return i;
  return atual;
}

/**
 * Typeahead, como no `<select>` nativo: o que se digitou em seguida procura a
 * opção que começa com aquilo (sem acento). Uma letra só — ou a mesma letra
 * repetida, "sss" — anda entre as que começam com ela, a partir da seguinte à
 * atual; mais de uma letra ("são p") procura a partir da atual. Devolve -1 sem
 * nenhuma.
 */
export function indicePorDigitacao(
  opcoes: Pick<OpcaoDoSelect, "rotulo" | "desabilitada">[],
  atual: number,
  digitado: string
): number {
  const termo = digitado.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (termo.trim() === "") return -1;
  const repetida = [...termo].every((c) => c === termo[0]);
  const procura = repetida ? termo[0]! : termo;
  const n = opcoes.length;
  const comeco = repetida ? atual + 1 : Math.max(atual, 0);
  for (let k = 0; k < n; k++) {
    const i = (((comeco + k) % n) + n) % n;
    const o = opcoes[i]!;
    if (!o.desabilitada && normalizar(o.rotulo).startsWith(procura)) return i;
  }
  return -1;
}

/** Tecla que escreve (letra, número, pontuação), e não atalho. */
export function ehTeclaDeTexto(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/** O protótipo dono do acessor `value` (o `HTMLSelectElement.prototype`) e o acessor. */
function acessorDoValor(el: object): { dono: object; d: PropertyDescriptor } | undefined {
  for (let proto = Object.getPrototypeOf(el); proto; proto = Object.getPrototypeOf(proto)) {
    const d = Object.getOwnPropertyDescriptor(proto, "value");
    if (d?.set && d.get) return { dono: proto, d };
  }
  return undefined;
}

/**
 * Troca o valor do `<select>` como o navegador troca quando a pessoa escolhe:
 * pelo setter do protótipo e com `input` e `change` que borbulham. O React
 * trata todo `change` num `<select>` como mudança (não há rastreador de valor
 * nele, como há no `<input>`), então chega no `onChange` do campo e no
 * `onChange` do `<form>` em volta — o caso do EmpresaForm, que guarda o
 * estado pelo form.
 */
export function escolherNoSelect(select: EventTarget & { value: string }, valor: string): void {
  const acessor = acessorDoValor(select);
  if (acessor) acessor.d.set!.call(select, valor);
  else select.value = valor;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

const AVISOS = Symbol.for("c41.select.avisosDoValor");

/**
 * Avisa quando alguém escreve `select.value = …` por código — o preenchimento
 * pelo CEP faz isso (`form.elements.namedItem("stateCode").value = uf`). Sem
 * evento nenhum, o campo desenhado ficaria mostrando o valor antigo enquanto o
 * formulário enviaria o novo. Devolve a função que desfaz.
 *
 * O setter é embrulhado no protótipo, uma vez só, e não na instância: o
 * `<select>` tem propriedades indexadas (`select[0]`), e acessor próprio num
 * objeto assim é terreno de bug de motor (o jsdom recusa a escrita). Quem não
 * se inscreveu não paga nada além de uma busca num WeakMap.
 */
export function vigiarValor(el: object, aviso: () => void): () => void {
  const acessor = acessorDoValor(el);
  if (!acessor) return () => {};
  const dono = acessor.dono as { [AVISOS]?: WeakMap<object, () => void> };
  let avisos = dono[AVISOS];
  if (!avisos) {
    const mapa = new WeakMap<object, () => void>();
    avisos = mapa;
    const { get, set } = acessor.d;
    Object.defineProperty(dono, "value", {
      configurable: true,
      enumerable: acessor.d.enumerable,
      get,
      set(this: object, v: unknown) {
        set!.call(this, v);
        mapa.get(this)?.();
      },
    });
    Object.defineProperty(dono, AVISOS, { value: mapa });
  }
  avisos.set(el, aviso);
  return () => {
    if (avisos.get(el) === aviso) avisos.delete(el);
  };
}
