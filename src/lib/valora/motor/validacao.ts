// Motor do Valora — valores padrão e validação do que chega de formulário ou do banco.
// Sem Next, sem Prisma, sem React: copiado para o 41-gestao. Editar só aqui, no Connect.

import { REGIMES, type Catalogo, type ParametrosPreco, type Perfil, type Regime } from "./tipos";

export const PARAMETROS_PADRAO: ParametrosPreco = {
  despesasFixasMes: 0,
  variaveisPct: 15, // impostos 11 + inadimplência 3 + taxas 1 — o mesmo padrão da calculadora do 41-gestao
  margemAlvoPct: 20,
  margemPisoPct: 0,
  descontoMaximoPct: 15,
};

const numero = (x: unknown, min: number, max: number): number | null => {
  const n = typeof x === "string" ? Number(x.replace(",", ".")) : Number(x);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

/** Parâmetros de preço válidos, ou null. Variáveis + margem alvo têm de ficar abaixo de 100%. */
export function normalizarParametros(v: unknown): ParametrosPreco | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const p = {
    despesasFixasMes: numero(o.despesasFixasMes, 0, 100_000_000),
    variaveisPct: numero(o.variaveisPct, 0, 100),
    margemAlvoPct: numero(o.margemAlvoPct, 0, 100),
    margemPisoPct: numero(o.margemPisoPct, 0, 100),
    descontoMaximoPct: numero(o.descontoMaximoPct, 0, 99),
  };
  if (Object.values(p).some((x) => x === null)) return null;
  const ok = p as ParametrosPreco;
  if (ok.variaveisPct + ok.margemAlvoPct >= 100) return null;
  if (ok.margemPisoPct > ok.margemAlvoPct) return null;
  return ok;
}

/** Ajustes que o escritório faz nos setores do catálogo (custo da equipe, capacidade, fator). */
export type AjusteSetor = { codigo: string; custoMensal: number; capacidadeHorasMes: number; fatorCalibracao: number };

export function normalizarAjustes(v: unknown, catalogo: Catalogo): AjusteSetor[] | null {
  if (!Array.isArray(v)) return null;
  const out: AjusteSetor[] = [];
  for (const s of catalogo.setores) {
    const o = v.find((x) => x && typeof x === "object" && (x as AjusteSetor).codigo === s.codigo) as Record<string, unknown> | undefined;
    if (!o) continue;
    const custoMensal = numero(o.custoMensal, 0, 100_000_000);
    const capacidadeHorasMes = numero(o.capacidadeHorasMes, 0, 1_000_000);
    const fatorCalibracao = numero(o.fatorCalibracao, 0.05, 5);
    if (custoMensal === null || capacidadeHorasMes === null || fatorCalibracao === null) return null;
    out.push({ codigo: s.codigo, custoMensal, capacidadeHorasMes, fatorCalibracao });
  }
  return out;
}

/** Catálogo com os ajustes do escritório aplicados por cima do modelo. */
export function aplicarAjustes(catalogo: Catalogo, ajustes: AjusteSetor[]): Catalogo {
  return {
    ...catalogo,
    setores: catalogo.setores.map((s) => {
      const a = ajustes.find((x) => x.codigo === s.codigo);
      return a ? { ...s, custoMensal: a.custoMensal, capacidadeHorasMes: a.capacidadeHorasMes, fatorCalibracao: a.fatorCalibracao } : s;
    }),
  };
}

/** Perfil do cliente válido para o catálogo, ou null. Chave desconhecida é descartada. */
export function normalizarPerfil(v: unknown, catalogo: Catalogo): Perfil | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!REGIMES.includes(o.regime as Regime)) return null;
  const setoresValidos = new Set(catalogo.setores.map((s) => s.codigo));
  const complexValidas = new Set(catalogo.complexidades.map((c) => c.id));
  const lista = (x: unknown, validos: Set<string>) =>
    Array.isArray(x) ? [...new Set(x.filter((i): i is string => typeof i === "string" && validos.has(i)))] : [];
  const volumesIn = (o.volumes && typeof o.volumes === "object" ? o.volumes : {}) as Record<string, unknown>;
  const marcadoresIn = (o.marcadores && typeof o.marcadores === "object" ? o.marcadores : {}) as Record<string, unknown>;
  const volumes: Record<string, number> = {};
  const marcadores: Record<string, boolean> = {};
  for (const c of catalogo.campos) {
    if (c.tipo === "volume") volumes[c.chave] = numero(volumesIn[c.chave] ?? 0, 0, 1_000_000) ?? 0;
    else marcadores[c.chave] = marcadoresIn[c.chave] === true;
  }
  const setores = lista(o.setores, setoresValidos);
  if (setores.length === 0) return null;
  return {
    regime: o.regime as Regime,
    semMovimento: o.semMovimento === true,
    setores,
    volumes,
    marcadores,
    complexidades: lista(o.complexidades, complexValidas),
  };
}

export function perfilVazio(catalogo: Catalogo): Perfil {
  return {
    regime: "SIMPLES",
    semMovimento: false,
    setores: catalogo.setores.map((s) => s.codigo),
    volumes: Object.fromEntries(catalogo.campos.filter((c) => c.tipo === "volume").map((c) => [c.chave, 0])),
    marcadores: Object.fromEntries(catalogo.campos.filter((c) => c.tipo === "marcador").map((c) => [c.chave, false])),
    complexidades: [],
  };
}

export const ROTULO_REGIME: Record<Regime, string> = {
  MEI: "MEI",
  SIMPLES: "Simples Nacional",
  PRESUMIDO: "Lucro Presumido",
  REAL: "Lucro Real",
};
