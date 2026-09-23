const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DECIMAIS = [0, 1, 2].map((casas) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }));

/** Reais; null (preço impossível) vira travessão. */
export function brl(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : REAIS.format(v);
}

/** Número em pt-BR com até `casas` decimais (0 a 2). */
export function num(v: number, casas: 0 | 1 | 2 = 1): string {
  return DECIMAIS[casas].format(v);
}

export function horas(h: number): string {
  return `${num(h, 1)} h`;
}
