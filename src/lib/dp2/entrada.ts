// Números digitados no DP 2: "1.234,56", "1234.56", "R$ 1.234,56", "7,5".
// Puro, sem banco.

/** O número digitado, ou `null` quando vazio ou ilegível. */
export function lerNumero(bruto: string | null | undefined): number | null {
  if (bruto === null || bruto === undefined) return null;
  let s = String(bruto).replace(/R\$|\s|%/gi, "");
  if (!s) return null;
  const negativo = s.startsWith("-");
  s = s.replace(/^-/, "");
  if (s.includes(",")) {
    // Vírgula é o decimal; ponto, o milhar.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  } else if (/^\d{1,3}\.\d{3}$/.test(s)) {
    // "1.234" sem vírgula: milhar, como a Domínio exporta.
    s = s.replace(".", "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

export function lerInteiro(bruto: string | null | undefined): number | null {
  const n = lerNumero(bruto);
  return n === null || !Number.isInteger(n) ? null : n;
}
