// Número digitado nos campos do Planejamento tributário (05/11/2026).
//
// O original usava `<input type="number">`, que só entende ponto decimal. No
// Connect os campos são texto com `inputMode="decimal"`, e a pessoa digita do
// jeito brasileiro: "1.234,56". Aqui fica a leitura e a escrita, sem React,
// para o campo e os testes usarem igual.
//
// Dinheiro e os demais campos leem o ponto de jeitos diferentes: em reais,
// "1.075" é mil e setenta e cinco (milhar, como se escreve no Brasil); num
// percentual ou no FAP, que vai de 0,5 a 2, "1.075" é 1,075 — quem digita
// ponto ali está escrevendo decimal, como o campo do original pedia.

/**
 * Lê o que foi digitado.
 * - `null`: campo vazio (no motor, "não informado" — diferente de zero).
 * - `undefined`: ainda não é número ("1,2,3", "abc"); o campo não repassa.
 * - número: "1.234,56", "1234,56", "1234.56", "-10"; "1.234" é milhar só em dinheiro.
 */
export function lerNumeroDigitado(texto: string, dinheiro = true): number | null | undefined {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return null;
  let normal: string;
  if (t.includes(",")) {
    // Vírgula é o decimal: os pontos são separadores de milhar.
    if ((t.match(/,/g) ?? []).length > 1) return undefined;
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (dinheiro && /^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // Em reais, "1.234" ou "1.234.567" é milhar.
    normal = t.replace(/\./g, "");
  } else {
    normal = t;
  }
  if (!/^-?\d*\.?\d*$/.test(normal) || normal === "-" || normal === "." || normal === "-.") return undefined;
  const n = Number(normal);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * O número como aparece no campo fora da edição. Dinheiro: milhar e até duas
 * casas ("1.200.000", "1.234,56"). Demais campos: todas as casas que o valor
 * tem (até seis) e sem milhar ("1,2345", "3650"), para o FAP e os percentuais
 * mostrarem o mesmo número que o cálculo usa.
 */
export function textoFormatadoDoNumero(valor: number | null | undefined, dinheiro = true): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  return dinheiro
    ? Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
    : Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 6, useGrouping: false });
}

/** O número como aparece no campo enquanto se edita: vírgula decimal, sem milhar. */
export function textoDoNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  return String(valor).replace(".", ",");
}
