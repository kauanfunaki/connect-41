// Número digitado nos campos do Planejamento tributário (05/11/2026).
//
// O original usava `<input type="number">`, que só entende ponto decimal. No
// Connect os campos são texto com `inputMode="decimal"`, e a pessoa digita do
// jeito brasileiro: "1.234,56". Aqui fica a leitura e a escrita, sem React,
// para o campo e os testes usarem igual.

/**
 * Lê o que foi digitado.
 * - `null`: campo vazio (no motor, "não informado" — diferente de zero).
 * - `undefined`: ainda não é número ("1,2,3", "abc"); o campo não repassa.
 * - número: "1.234,56", "1234,56", "1234.56", "-10", "1.234" (milhar).
 */
export function lerNumeroDigitado(texto: string): number | null | undefined {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return null;
  let normal: string;
  if (t.includes(",")) {
    // Vírgula é o decimal: os pontos são separadores de milhar.
    if ((t.match(/,/g) ?? []).length > 1) return undefined;
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // "1.234" ou "1.234.567": milhar, como se escreve no Brasil.
    normal = t.replace(/\./g, "");
  } else {
    normal = t;
  }
  if (!/^-?\d*\.?\d*$/.test(normal) || normal === "-" || normal === "." || normal === "-.") return undefined;
  const n = Number(normal);
  return Number.isFinite(n) ? n : undefined;
}

/** O número como aparece no campo enquanto se edita: vírgula decimal, sem milhar. */
export function textoDoNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  return String(valor).replace(".", ",");
}
