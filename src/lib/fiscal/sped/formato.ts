// Formatos da aba SPED (29/10/2026). Puro, usável no servidor e no cliente.
// Dinheiro chega em centavos inteiros (`arquivoIcms.ts`); alíquota, em
// centésimos de ponto percentual.

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMERO = new Intl.NumberFormat("pt-BR");
const DECIMAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const reaisDeCentavos = (centavos: number) => REAIS.format(centavos / 100);
/** "1.234,56", sem o "R$" — para campo digitável. */
export const decimalDeCentavos = (centavos: number) => DECIMAL.format(centavos / 100);
export const aliquotaDeCentesimos = (centesimos: number) => `${DECIMAL.format(centesimos / 100)}%`;
export const contagem = (n: number) => NUMERO.format(n);

export function cnpjFormatado(cnpj: string): string {
  return /^\d{14}$/.test(cnpj) ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : cnpj;
}

/** "2026-09" → "setembro de 2026". */
export function mesPorExtenso(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  if (!a || !m) return competencia;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, 1)));
}

/** Busca sem acento e sem caixa. */
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
