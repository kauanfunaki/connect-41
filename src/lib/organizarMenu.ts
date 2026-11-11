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
export const CHAVES_DO_GERAL = ["apoio", "cadastros", "transferencias", "solicitacoes", "atendimento", "chamados", "arquivos", "agenda"] as const;

/**
 * Os itens do Geral que são grupo, com telas dentro que o organizador ordena e
 * esconde (a chave em `dentro` e `ocultasDentro`): o Apoio (05/11/2026) e os
 * Cadastros (10/11/2026, pedido do Kauan — Empresas, Pessoas e, no BPO,
 * Fornecedores e sacados).
 */
export const GRUPOS_DO_GERAL = ["apoio", "cadastros"] as const;
export type GrupoDoGeral = (typeof GRUPOS_DO_GERAL)[number];

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
type PorMenu = Readonly<Record<string, readonly string[]>>;

/** Só os menus com alguma coisa, ou nada. */
function soComItens(x: PorMenu | undefined): Record<string, string[]> | undefined {
  const menus = Object.entries(x ?? {}).filter(([, l]) => l.length > 0);
  return menus.length ? Object.fromEntries(menus.map(([m, l]) => [m, [...l]])) : undefined;
}

export function ordemDosBlocos(
  blocos: readonly BlocoDoMenu<TelaDoMenu>[],
  extras: { ocultas?: readonly string[]; geral?: readonly string[]; dentro?: PorMenu; ocultasGeral?: readonly string[]; ocultasDentro?: PorMenu } = {},
): OrdemDoMenu {
  const { ocultas = [], geral = [], ocultasGeral = [] } = extras;
  const dentro = soComItens(extras.dentro);
  const ocultasDentro = soComItens(extras.ocultasDentro);
  return {
    grupos: blocos.map((b) => b.grupo),
    telas: blocos.flatMap(telasDoBloco).map((t) => t.code),
    ...(ocultas.length ? { ocultas: [...ocultas] } : {}),
    ...(geral.length ? { geral: [...geral] } : {}),
    ...(dentro ? { dentro } : {}),
    ...(ocultasGeral.length ? { ocultasGeral: [...ocultasGeral] } : {}),
    ...(ocultasDentro ? { ocultasDentro } : {}),
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
