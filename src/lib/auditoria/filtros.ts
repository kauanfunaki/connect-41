// Os filtros da auditoria na URL — o que a tela lê e os links dos botões.
// Puro, sem banco.

import { AREAS_DA_AUDITORIA, type ChaveDaAreaDaAuditoria, type TipoDaAcao } from "./acoes";
import { resolverPeriodo, type ChaveDoPeriodo, type Periodo } from "./dias";

export type FiltrosDaAuditoria = {
  tipo: Exclude<TipoDaAcao, "outro"> | null;
  /** userId, ou "nome:<nome>" para quem foi excluído. */
  pessoa: string | null;
  area: ChaveDaAreaDaAuditoria | null;
  periodo: Periodo;
  busca: string;
  /** O dia aberto com "Mostrar mais" e quantas ações dele aparecem. */
  dia: string | null;
  ver: number;
  /** Quantos dias com ação aparecem (cresce com "Ver dias anteriores"). */
  dias: number;
};

export const POR_DIA = 10;
export const MAIS_POR_VEZ = 50;
export const DIAS_POR_VEZ = 7;
const TETO_DE_DIAS = 60;
const TETO_POR_DIA = 1000;

type Bruto = Record<string, string | string[] | undefined>;

function um(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
}

function inteiro(v: string | null, padrao: number, min: number, max: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
}

export function lerFiltros(sp: Bruto, hoje: string): FiltrosDaAuditoria {
  const tipo = um(sp.tipo);
  const area = um(sp.area);
  const dia = um(sp.dia);
  return {
    tipo: tipo === "criou" || tipo === "editou" || tipo === "excluiu" ? tipo : null,
    pessoa: um(sp.pessoa),
    area: area && area in AREAS_DA_AUDITORIA ? (area as ChaveDaAreaDaAuditoria) : null,
    periodo: resolverPeriodo(um(sp.periodo), um(sp.de), um(sp.ate), hoje),
    busca: (um(sp.q) ?? "").slice(0, 100),
    dia: dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null,
    ver: inteiro(um(sp.ver), POR_DIA + MAIS_POR_VEZ, POR_DIA, TETO_POR_DIA),
    dias: inteiro(um(sp.dias), DIAS_POR_VEZ, 1, TETO_DE_DIAS),
  };
}

/** Os parâmetros do filtro (sem o "mostrar mais"), para montar links. */
export function parametrosDosFiltros(f: FiltrosDaAuditoria): URLSearchParams {
  const q = new URLSearchParams();
  if (f.tipo) q.set("tipo", f.tipo);
  if (f.pessoa) q.set("pessoa", f.pessoa);
  if (f.area) q.set("area", f.area);
  if (f.periodo.chave !== "7d") q.set("periodo", f.periodo.chave);
  if (f.periodo.chave === "datas") {
    q.set("de", f.periodo.de);
    q.set("ate", f.periodo.ate);
  }
  if (f.busca) q.set("q", f.busca);
  return q;
}

const BASE = "/admin/auditoria";

/**
 * O endereço da tela com uma troca. Mudar qualquer filtro volta a lista ao
 * começo (sem dia aberto, sete dias); `dia`/`ver`/`dias` só pelo "mostrar mais".
 */
export function hrefDaAuditoria(
  f: FiltrosDaAuditoria,
  troca: Partial<Record<"tipo" | "pessoa" | "area" | "q", string | null>> & { dia?: string; ver?: number; dias?: number } = {}
): string {
  const q = parametrosDosFiltros(f);
  for (const [k, v] of Object.entries(troca)) {
    if (k === "dia" || k === "ver" || k === "dias") continue;
    if (v === null || v === undefined || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  const mantemAbertura = troca.dia !== undefined || troca.dias !== undefined;
  if (mantemAbertura) {
    const dias = troca.dias ?? f.dias;
    if (dias !== DIAS_POR_VEZ) q.set("dias", String(dias));
    const dia = troca.dia ?? f.dia;
    if (dia) {
      q.set("dia", dia);
      q.set("ver", String(troca.ver ?? f.ver));
    }
  }
  const s = q.toString();
  return s ? `${BASE}?${s}` : BASE;
}

/** O endereço com outro período (um atalho; "datas" a tela completa com `de`/`ate`). */
export function hrefDoPeriodo(f: FiltrosDaAuditoria, chave: Exclude<ChaveDoPeriodo, "datas">): string {
  const q = parametrosDosFiltros(f);
  q.delete("periodo");
  q.delete("de");
  q.delete("ate");
  if (chave !== "7d") q.set("periodo", chave);
  const s = q.toString();
  return s ? `${BASE}?${s}` : BASE;
}

/** Há filtro além do período padrão — mostra o "Limpar filtros". */
export function temFiltro(f: FiltrosDaAuditoria): boolean {
  return Boolean(f.tipo || f.pessoa || f.area || f.busca || f.periodo.chave !== "7d");
}
