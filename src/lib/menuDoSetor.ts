import { ORDEM_DOS_GRUPOS, getModuleDef, grupoDoModulo, type GrupoDeModulo } from "@/lib/module-catalog";

// A regra do menu de um setor (05/11/2026, página "Ajustes de 05/11"). Antes
// eram quatro jeitos: até 8 telas lista solta, mais que isso grupos com
// contagem (o BPO), e GitHub, Ops Center e o Painel de Gestão com janelas
// escritas à mão — o Societário, com 8 telas, ficava sem grupo nenhum enquanto
// o BPO tinha cinco.
//
// Agora, para todo setor:
// - as telas se juntam pelo tema (`group` do catálogo), na ordem de
//   `ORDEM_DOS_GRUPOS`;
// - grupo com uma tela só vira tela solta (não há grupo de um item);
// - a tela que veio de outra (`telaMae`, "Tela 1 / Tela 2") entra no grupo da
//   mãe, logo depois dela — Entregas com o Controle interno; Painel, Órgãos e
//   Relatórios com Processos.
//
// O desenho é a opção C, "o jeito do BPO para todos" (o Kauan trocou a A pela C
// no mesmo dia): o grupo e a tela com filhas são uma linha com o número de
// telas e o "›", e a janela abre ao lado (`ItemComJanela`, no AppShell).
//
// Só a montagem; o desenho é do AppShell.

export type TelaDoMenu = { code: string; label: string; href: string };

/** Uma tela no menu, com as que vieram dela logo abaixo. */
export type EntradaDoMenu<T extends TelaDoMenu = TelaDoMenu> = { tela: T; filhas: T[] };

export type BlocoDoMenu<T extends TelaDoMenu = TelaDoMenu> =
  | { tipo: "solta"; grupo: GrupoDeModulo; entrada: EntradaDoMenu<T> }
  | { tipo: "grupo"; grupo: GrupoDeModulo; entradas: EntradaDoMenu<T>[]; telas: number };

/**
 * A ordem que o super admin escolheu para o menu do setor (05/11/2026,
 * "Organizar menu"): os grupos e as telas, por código. O que não está na lista
 * vem depois, na ordem de sempre (a dos grupos e a do catálogo).
 */
export type OrdemDoMenu = {
  grupos: string[];
  telas: string[];
  /**
   * As telas que saem do menu do setor (09/11/2026, "Organizar no próprio
   * menu"): o olho esconde sem tirar do lugar. Só o menu — o endereço, a busca
   * e a página "Telas" do setor continuam levando a elas. Ausente = nenhuma.
   */
  ocultas?: string[];
};

export const ORDEM_PADRAO: OrdemDoMenu = { grupos: [], telas: [] };

/** A ordem escolhida mexe na posição de algum grupo ou tela (esconder não conta). */
export function ordemTemPosicao(ordem: OrdemDoMenu | null | undefined): boolean {
  return !!ordem && (ordem.grupos.length > 0 || ordem.telas.length > 0);
}

/** Nada escolhido: nem posição nem tela escondida. */
export function ordemEhPadrao(ordem: OrdemDoMenu | null | undefined): boolean {
  return !ordemTemPosicao(ordem) && !(ordem?.ocultas?.length);
}

/**
 * As telas que aparecem no menu: fora as escondidas e as filhas de uma mãe
 * escondida (esconder a tela de cima leva as de dentro junto).
 */
export function telasVisiveis<T extends TelaDoMenu>(telas: readonly T[], ordem: OrdemDoMenu | null | undefined): T[] {
  const ocultas = new Set(ordem?.ocultas ?? []);
  if (ocultas.size === 0) return [...telas];
  return telas.filter((t) => {
    if (ocultas.has(t.code)) return false;
    const mae = getModuleDef(t.code)?.telaMae;
    return !(mae && ocultas.has(mae));
  });
}

/** Lê a ordem gravada (JSON); qualquer coisa estranha vira a ordem padrão. */
export function lerOrdemDoMenu(json: string | null | undefined): OrdemDoMenu {
  if (!json) return ORDEM_PADRAO;
  try {
    const v: unknown = JSON.parse(json);
    if (!v || typeof v !== "object") return ORDEM_PADRAO;
    const lista = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === "string"))] : []);
    const o = v as Record<string, unknown>;
    const ocultas = lista(o.ocultas);
    return { grupos: lista(o.grupos), telas: lista(o.telas), ...(ocultas.length ? { ocultas } : {}) };
  } catch {
    return ORDEM_PADRAO;
  }
}

/** Ordena pela posição na lista escolhida; quem não está nela vai depois, na ordem em que veio. */
function pelaOrdem<T>(itens: readonly T[], chave: (i: T) => string, ordem: readonly string[]): T[] {
  if (ordem.length === 0) return [...itens];
  const pos = new Map(ordem.map((c, i) => [c, i]));
  return itens
    .map((item, i) => ({ item, i, p: pos.get(chave(item)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.item);
}

/**
 * Os blocos do menu do setor, na ordem dos grupos. Dentro de cada grupo, a
 * ordem em que as telas chegaram (a do catálogo) — ou a que o super admin
 * escolheu (`ordem`), para os grupos, as telas e as filhas de cada tela.
 */
export function montarMenuDoSetor<T extends TelaDoMenu>(telas: readonly T[], ordem: OrdemDoMenu = ORDEM_PADRAO): BlocoDoMenu<T>[] {
  const padrao = montarNaOrdemDoCatalogo(telas);
  const blocos = pelaOrdem(padrao, (b) => b.grupo, ordem.grupos);
  const ordenar = (e: EntradaDoMenu<T>): EntradaDoMenu<T> => ({ tela: e.tela, filhas: pelaOrdem(e.filhas, (f) => f.code, ordem.telas) });
  return blocos.map((b) =>
    b.tipo === "solta" ? { ...b, entrada: ordenar(b.entrada) } : { ...b, entradas: pelaOrdem(b.entradas, (e) => e.tela.code, ordem.telas).map(ordenar) },
  );
}

function montarNaOrdemDoCatalogo<T extends TelaDoMenu>(telas: readonly T[]): BlocoDoMenu<T>[] {
  const presentes = new Set(telas.map((t) => t.code));
  const maeDe = (code: string) => {
    const mae = getModuleDef(code)?.telaMae;
    // Mãe fora do menu (desligada, em outro setor ou ela mesma filha): tela comum.
    return mae && mae !== code && presentes.has(mae) && !getModuleDef(mae)?.telaMae ? mae : null;
  };

  const entradas = new Map<string, EntradaDoMenu<T>>();
  for (const t of telas) if (!maeDe(t.code)) entradas.set(t.code, { tela: t, filhas: [] });
  for (const t of telas) {
    const mae = maeDe(t.code);
    if (mae) entradas.get(mae)!.filhas.push(t);
  }

  const porGrupo = new Map<GrupoDeModulo, EntradaDoMenu<T>[]>();
  for (const e of entradas.values()) {
    const grupo = grupoDoModulo(e.tela.code);
    const lista = porGrupo.get(grupo);
    if (lista) lista.push(e);
    else porGrupo.set(grupo, [e]);
  }

  return ORDEM_DOS_GRUPOS.filter((g) => porGrupo.has(g)).map((grupo): BlocoDoMenu<T> => {
    const lista = porGrupo.get(grupo)!;
    if (lista.length === 1) return { tipo: "solta", grupo, entrada: lista[0]! };
    return { tipo: "grupo", grupo, entradas: lista, telas: lista.reduce((n, e) => n + 1 + e.filhas.length, 0) };
  });
}

/** As telas de um bloco, a mãe antes das filhas — para a cor do grupo e para conferir o menu. */
export function telasDoBloco<T extends TelaDoMenu>(bloco: BlocoDoMenu<T>): T[] {
  const lista = bloco.tipo === "solta" ? [bloco.entrada] : bloco.entradas;
  return lista.flatMap((e) => [e.tela, ...e.filhas]);
}
