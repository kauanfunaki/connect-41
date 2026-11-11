// Números da memória de cálculo do DP 2: "1.234,56", "7,5%", "10,5 h".
// Sem "R$" na memória: a conta fica mais curta e o holerite já diz que é real.

const DUAS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ATE_QUATRO = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

export function reais(v: number): string {
  return DUAS.format(v);
}

export function pct(v: number): string {
  return `${ATE_QUATRO.format(v)}%`;
}

export function num(v: number): string {
  return ATE_QUATRO.format(v);
}

const ATE_SEIS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 6 });

/** Fatores com mais casas (o 0,133145 da redução do IRRF). */
export function fator(v: number): string {
  return ATE_SEIS.format(v);
}
