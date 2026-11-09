import { telasDoBloco, type BlocoDoMenu, type EntradaDoMenu, type OrdemDoMenu, type TelaDoMenu } from "./menuDoSetor";

// Organizar no próprio menu (09/11/2026, desenho "A · Organizar no próprio
// menu"): as contas do arrastar e do olho, sem tela. O modo de edição da
// lateral (`OrganizarMenuNaLateral`) só chama estas funções e grava o
// resultado na mesma ordem do setor que Admin › Setores usa.
//
// A regra de sempre continua: uma tela fica no grupo dela, e a que veio de
// outra fica embaixo da tela de origem. Por isso cada arrasto mexe numa lista
// só — os blocos do menu, as telas de um grupo ou as filhas de uma tela.

/** Onde o arrasto acontece. O Geral só muda de ordem dentro dele mesmo. */
export type ListaDoMenu =
  | { tipo: "geral" }
  | { tipo: "blocos" }
  | { tipo: "grupo"; grupo: string }
  | { tipo: "filhas"; mae: string }
  /** O que fica dentro de um menu (as filhas e as abas da tela, ou o Apoio), na ordem da tela. */
  | { tipo: "dentro"; mae: string; chaves: string[] };

/** Os itens do Geral que o organizador ordena (as chaves do `itensDoGeral` do AppShell). */
export const CHAVES_DO_GERAL = ["apoio", "cadastros", "transferencias", "solicitacoes", "chamados", "arquivos", "agenda"] as const;

/**
 * Tira o item `de` e põe antes do que estava em `antesDe` (0 a `lista.length`,
 * contado na lista ANTES de tirar). `antesDe` igual a `de` ou `de + 1` não muda nada.
 */
export function moverNaLista<T>(lista: readonly T[], de: number, antesDe: number): T[] {
  if (de < 0 || de >= lista.length) return [...lista];
  const alvo = Math.max(0, Math.min(lista.length, antesDe));
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(alvo > de ? alvo - 1 : alvo, 0, item!);
  return nova;
}

/** A ordem que reproduz estes blocos exatamente como estão (grupos e todas as telas). */
export function ordemDosBlocos(
  blocos: readonly BlocoDoMenu<TelaDoMenu>[],
  ocultas: readonly string[] = [],
  geral: readonly string[] = [],
  dentro: Readonly<Record<string, readonly string[]>> = {},
): OrdemDoMenu {
  const menus = Object.entries(dentro).filter(([, l]) => l.length > 0);
  return {
    grupos: blocos.map((b) => b.grupo),
    telas: blocos.flatMap(telasDoBloco).map((t) => t.code),
    ...(ocultas.length ? { ocultas: [...ocultas] } : {}),
    ...(geral.length ? { geral: [...geral] } : {}),
    ...(menus.length ? { dentro: Object.fromEntries(menus.map(([m, l]) => [m, [...l]])) } : {}),
  };
}

function comFilhas<T extends TelaDoMenu>(e: EntradaDoMenu<T>, mae: string, de: number, antesDe: number): EntradaDoMenu<T> {
  return e.tela.code === mae ? { tela: e.tela, filhas: moverNaLista(e.filhas, de, antesDe) } : e;
}

/** Os blocos depois de um arrasto numa das listas do menu. */
export function moverNoMenu<T extends TelaDoMenu>(blocos: readonly BlocoDoMenu<T>[], lista: ListaDoMenu, de: number, antesDe: number): BlocoDoMenu<T>[] {
  if (lista.tipo === "geral" || lista.tipo === "dentro") return [...blocos];
  if (lista.tipo === "blocos") return moverNaLista(blocos, de, antesDe);
  return blocos.map((b): BlocoDoMenu<T> => {
    if (lista.tipo === "grupo") {
      return b.tipo === "grupo" && b.grupo === lista.grupo ? { ...b, entradas: moverNaLista(b.entradas, de, antesDe) } : b;
    }
    return b.tipo === "solta"
      ? { ...b, entrada: comFilhas(b.entrada, lista.mae, de, antesDe) }
      : { ...b, entradas: b.entradas.map((e) => comFilhas(e, lista.mae, de, antesDe)) };
  });
}

/** Esconde a tela ou a devolve ao menu. */
export function alternarOculta(ocultas: readonly string[], code: string): string[] {
  return ocultas.includes(code) ? ocultas.filter((c) => c !== code) : [...ocultas, code];
}
