// CPF, CNPJ, CNAE e o Id do evento do eSocial (12/11/2026, DP 2 fase 3a).
// Puro, sem banco.

export const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function cpfValido(v: string | null | undefined): boolean {
  const d = digitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, peso: number) => {
    let soma = 0;
    for (const c of base) soma += Number(c) * peso--;
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

export function cnpjValido(v: string | null | undefined): boolean {
  const d = digitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((s, c, i) => s + Number(c) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]);
}

/** O CNAE no formato do eSocial: 7 dígitos ("6920-6/01" → "6920601"). */
export function cnaeDoEsocial(v: string | null | undefined): string | null {
  const d = digitos(v);
  return d.length === 7 ? d : null;
}

/**
 * O Id do evento: "ID" + tipo de inscrição (1) + inscrição (14) + data e hora
 * AAAAMMDDHHMMSS + sequencial (5) = 36 caracteres. No CNPJ vai a raiz (8
 * dígitos) completada com zeros à direita.
 */
export function idDoEvento(cnpj: string, quando: Date, sequencial: number): string {
  const raiz = digitos(cnpj).slice(0, 8).padEnd(14, "0");
  const iso = quando.toISOString();
  const carimbo = iso.slice(0, 19).replace(/[-T:]/g, "");
  return `ID1${raiz}${carimbo}${String(sequencial % 100000).padStart(5, "0")}`;
}

/** A raiz do CNPJ, que identifica o empregador no eSocial. */
export function raizDoCnpj(cnpj: string): string {
  return digitos(cnpj).slice(0, 8);
}
