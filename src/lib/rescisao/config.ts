// Resolução da config de rescisão: padrão legal → tenant → empresa.
//
// Além do valor efetivo, devolve a ORIGEM de cada campo. Sem isso a decisão de
// "empresa sobrescreve só o que difere" se perde na prática: o usuário abre a
// tela da empresa e não sabe o que está herdando do escritório.

import type { InsalubridadeGrau, InsalubridadeBase, MediaBase } from "@/generated/prisma/enums";

export type RescisaoConfig = {
  insalubridadeGrau: InsalubridadeGrau;
  insalubridadeBase: InsalubridadeBase;
  periculosidadeAplica: boolean;
  periculosidadeIntegral: boolean;
  mediaMeses: number;
  mediaBaseFerias: MediaBase;
  mediaBaseDecimoTerceiro: MediaBase;
  tercoApresentadoSeparado: boolean;
  verbasDesabilitadas: string[];
  descontosPadrao: DescontoPadrao[];
  toleranciaPct: number;
  cctNome: string | null;
  cctObservacoes: string | null;
};

export type DescontoPadrao = { label: string; tipo: string; valor: number };

export type OrigemCampo = "PADRAO_LEGAL" | "TENANT" | "EMPRESA";
export type RescisaoConfigResolvida = {
  valores: RescisaoConfig;
  origem: Record<keyof RescisaoConfig, OrigemCampo>;
};

/** Tolerância máxima aceita — acima disso divergências deixariam de acender. */
export const TOLERANCIA_MAX_PCT = 5;
export const TOLERANCIA_PADRAO_PCT = 1;
/** Piso absoluto de divergência: é arredondamento de centavo, não política. */
export const TOLERANCIA_PISO_ABSOLUTO = 0.05;

export const MEDIA_MESES_MIN = 3;
export const MEDIA_MESES_MAX = 12;

// Defaults = o que a lei manda quando ninguém configurou nada.
export const CONFIG_PADRAO: RescisaoConfig = {
  insalubridadeGrau: "NENHUM",
  insalubridadeBase: "SALARIO_MINIMO",
  periculosidadeAplica: false,
  periculosidadeIntegral: false,
  mediaMeses: 12,
  mediaBaseFerias: "PERIODO_AQUISITIVO",
  mediaBaseDecimoTerceiro: "ANO_CIVIL",
  tercoApresentadoSeparado: true,
  verbasDesabilitadas: [],
  descontosPadrao: [],
  toleranciaPct: TOLERANCIA_PADRAO_PCT,
  cctNome: null,
  cctObservacoes: null,
};

/** Shape aceito das linhas do banco — Decimal já convertido para number. */
export type ConfigRow = Partial<Record<keyof RescisaoConfig, unknown>> | null | undefined;

function parseStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

function parseDescontos(v: unknown): DescontoPadrao[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: DescontoPadrao[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.label !== "string") continue;
    const valor = typeof o.valor === "number" ? o.valor : Number(o.valor);
    if (!Number.isFinite(valor)) continue;
    out.push({ label: o.label, tipo: typeof o.tipo === "string" ? o.tipo : "OUTRO", valor });
  }
  return out;
}

/**
 * Resolve a config efetiva. `null`/`undefined` em qualquer nível = herda.
 * A linha da empresa herda campo a campo, não tudo-ou-nada.
 */
export function resolveRescisaoConfig(tenantRow: ConfigRow, companyRow: ConfigRow): RescisaoConfigResolvida {
  const valores = { ...CONFIG_PADRAO };
  const origem = Object.fromEntries(
    (Object.keys(CONFIG_PADRAO) as (keyof RescisaoConfig)[]).map((k) => [k, "PADRAO_LEGAL" as OrigemCampo])
  ) as Record<keyof RescisaoConfig, OrigemCampo>;

  function aplicar(row: ConfigRow, nivel: Exclude<OrigemCampo, "PADRAO_LEGAL">) {
    if (!row) return;

    const set = <K extends keyof RescisaoConfig>(key: K, value: RescisaoConfig[K] | undefined) => {
      if (value === undefined || value === null) return;
      valores[key] = value;
      origem[key] = nivel;
    };

    set("insalubridadeGrau", row.insalubridadeGrau as InsalubridadeGrau | undefined);
    set("insalubridadeBase", row.insalubridadeBase as InsalubridadeBase | undefined);
    set("periculosidadeAplica", row.periculosidadeAplica as boolean | undefined);
    set("periculosidadeIntegral", row.periculosidadeIntegral as boolean | undefined);
    set("mediaBaseFerias", row.mediaBaseFerias as MediaBase | undefined);
    set("mediaBaseDecimoTerceiro", row.mediaBaseDecimoTerceiro as MediaBase | undefined);
    set("tercoApresentadoSeparado", row.tercoApresentadoSeparado as boolean | undefined);
    set("cctNome", row.cctNome as string | undefined);
    set("cctObservacoes", row.cctObservacoes as string | undefined);

    if (row.mediaMeses != null) {
      set("mediaMeses", clampMediaMeses(Number(row.mediaMeses)));
    }
    if (row.toleranciaPct != null) {
      set("toleranciaPct", clampTolerancia(Number(row.toleranciaPct)));
    }

    const verbas = parseStringArray(row.verbasDesabilitadas);
    if (verbas) set("verbasDesabilitadas", verbas);

    const descontos = parseDescontos(row.descontosPadrao);
    if (descontos) set("descontosPadrao", descontos);
  }

  aplicar(tenantRow, "TENANT");
  aplicar(companyRow, "EMPRESA");

  return { valores, origem };
}

/** Cap de segurança — tolerância alta faz divergência real deixar de acender. */
export function clampTolerancia(pct: number): number {
  if (!Number.isFinite(pct) || pct < 0) return TOLERANCIA_PADRAO_PCT;
  return Math.min(pct, TOLERANCIA_MAX_PCT);
}

export function clampMediaMeses(meses: number): number {
  if (!Number.isFinite(meses)) return CONFIG_PADRAO.mediaMeses;
  return Math.min(Math.max(Math.round(meses), MEDIA_MESES_MIN), MEDIA_MESES_MAX);
}

/**
 * Divergência entre informado e calculado. O piso absoluto evita acusar
 * diferença de centavo vinda de arredondamento.
 */
export function excedeTolerancia(informado: number, calculado: number, toleranciaPct: number): boolean {
  const limite = Math.max(TOLERANCIA_PISO_ABSOLUTO, (toleranciaPct / 100) * Math.abs(calculado));
  return Math.abs(informado - calculado) > limite;
}
