// O que um plano libera, contado por setor (14/10/2026) — os cartões de
// Administração › Planos ("BPO 8/17") e os setores do cartão do plano no site.
//
// A conta é a lista de módulos do plano (`allowedModuleCodes`) contra o
// catálogo em código (`MODULE_CATALOG`). `null` é o plano sem restrição: libera
// o catálogo inteiro. Código que saiu do catálogo não conta para nada.
//
// Puro (catálogo e cores são constantes): serve à tela de Planos, ao site e
// aos testes, e pode ir para componente de cliente.

import { MODULE_CATALOG, type ModuleDef } from "@/lib/module-catalog";
import { DEFAULT_SECTORS, DEFAULT_SECTOR_LABELS } from "@/lib/sector-constants";

export type ModulosDoSetor = {
  /** Código do setor; numa linha agrupada, o do primeiro setor do grupo. */
  code: string;
  rotulo: string;
  cor: string;
  /** Módulos do setor no catálogo. */
  total: number;
  /** Quantos deles o plano libera. */
  liberados: number;
};

const COR_DO_SETOR: Record<string, string> = Object.fromEntries(DEFAULT_SECTORS.map((s) => [s.code, s.color]));
const COR_PADRAO = "#586577";

function rotuloDoSetor(code: string): string {
  return DEFAULT_SECTOR_LABELS[code] ?? code.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A lista de módulos guardada no plano: só textos; qualquer outra coisa é "sem restrição". */
export function lerModulosDoPlano(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  return valor.filter((c): c is string => typeof c === "string");
}

/**
 * Cada setor do catálogo, com quantos módulos tem e quantos o plano libera.
 *
 * Ordem: o setor com mais módulos primeiro (BPO, Fiscal, DP…); empate, pelo
 * nome. Assim a ordem é a mesma em todo plano e acompanha o catálogo sozinha.
 */
export function modulosPorSetor(liberados: readonly string[] | null, catalogo: readonly ModuleDef[] = MODULE_CATALOG): ModulosDoSetor[] {
  const doPlano = liberados === null ? null : new Set(liberados);
  const porSetor = new Map<string, ModulosDoSetor>();
  for (const m of catalogo) {
    const setor = porSetor.get(m.sectorCode) ?? {
      code: m.sectorCode,
      rotulo: rotuloDoSetor(m.sectorCode),
      cor: COR_DO_SETOR[m.sectorCode] ?? COR_PADRAO,
      total: 0,
      liberados: 0,
    };
    setor.total += 1;
    if (doPlano === null || doPlano.has(m.code)) setor.liberados += 1;
    porSetor.set(m.sectorCode, setor);
  }
  return [...porSetor.values()].sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Quantos módulos do catálogo o plano libera, e de quantos. */
export function totalDeModulos(setores: readonly ModulosDoSetor[]): { liberados: number; total: number } {
  return setores.reduce((t, s) => ({ liberados: t.liberados + s.liberados, total: t.total + s.total }), { liberados: 0, total: 0 });
}

/**
 * As linhas do cartão: os `visiveis` primeiros setores, e o resto numa linha
 * só — "Gestão e outros 3", com as contas somadas e a cor do primeiro. Um setor
 * sobrando não vira grupo de um.
 */
export function linhasDosSetores(setores: readonly ModulosDoSetor[], visiveis = 5): ModulosDoSetor[] {
  if (setores.length <= visiveis + 1) return [...setores];
  const resto = setores.slice(visiveis);
  const primeiro = resto[0]!;
  return [
    ...setores.slice(0, visiveis),
    {
      code: primeiro.code,
      rotulo: `${primeiro.rotulo} e outros ${resto.length - 1}`,
      cor: primeiro.cor,
      total: resto.reduce((n, s) => n + s.total, 0),
      liberados: resto.reduce((n, s) => n + s.liberados, 0),
    },
  ];
}

/** Os setores em que o plano libera ao menos um módulo — os do "O que inclui" do site. */
export function setoresIncluidos(liberados: readonly string[] | null, catalogo: readonly ModuleDef[] = MODULE_CATALOG): ModulosDoSetor[] {
  return modulosPorSetor(liberados, catalogo).filter((s) => s.liberados > 0);
}
