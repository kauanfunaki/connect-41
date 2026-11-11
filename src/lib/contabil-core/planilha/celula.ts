// O valor de uma célula de planilha com o tipo que o Python dá a ele (Fase 4b, 10/11/2026).
//
// O tipo importa para o resultado, e não só para a conta: o leitor de extrato em planilha do
// Contábil Core faz `Decimal(str(valor))` e põe `str(celula)` no histórico, e o `fitid` (que entra
// na chave de duplicidade dos dados migrados) é o hash de `str(valor)`. Um número que o openpyxl
// lê como `int` vira "1500"; o mesmo número lido pelo xlrd, que devolve sempre `float`, vira
// "1500.0". Por isso cada leitor (xlsx, xls, csv) devolve o tipo que a biblioteca do original
// devolveria, e `strPy` escreve como o `str()` do Python.

export type Celula =
  | null
  | string
  | { tipo: "int"; valor: bigint }
  | { tipo: "float"; valor: number }
  | { tipo: "bool"; valor: boolean }
  /** `datetime`: "AAAA-MM-DD HH:MM:SS[.ffffff]" (o `str()` do Python). */
  | { tipo: "datahora"; valor: string }
  /** `time`: "HH:MM:SS[.ffffff]". */
  | { tipo: "hora"; valor: string }
  /** `timedelta`: o `str()` do Python ("1 day, 2:03:04"). */
  | { tipo: "duracao"; valor: string };

/** `repr(float)` do Python: dígitos mínimos, notação científica fora de 1e-4 ≤ |x| < 1e16. */
export function reprFloat(n: number): string {
  if (Number.isNaN(n)) return "nan";
  if (!Number.isFinite(n)) return n > 0 ? "inf" : "-inf";
  if (n === 0) return Object.is(n, -0) ? "-0.0" : "0.0";
  const [mantissa, exp] = n.toExponential().split("e");
  const e = Number(exp);
  const negativo = mantissa.startsWith("-");
  const digitos = mantissa.replace("-", "").replace(".", "");
  const sinal = negativo ? "-" : "";
  if (e < -4 || e >= 16) {
    const m = digitos.length > 1 ? `${digitos[0]}.${digitos.slice(1)}` : digitos;
    return `${sinal}${m}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
  }
  let texto: string;
  if (e < 0) texto = `0.${"0".repeat(-e - 1)}${digitos}`;
  else if (digitos.length <= e + 1) texto = `${digitos}${"0".repeat(e + 1 - digitos.length)}.0`;
  else texto = `${digitos.slice(0, e + 1)}.${digitos.slice(e + 1)}`;
  return sinal + texto;
}

/** `str(valor)` do Python. `None` vira "None", como no original. */
export function strPy(c: Celula): string {
  if (c === null) return "None";
  if (typeof c === "string") return c;
  switch (c.tipo) {
    case "int":
      return c.valor.toString();
    case "float":
      return reprFloat(c.valor);
    case "bool":
      return c.valor ? "True" : "False";
    default:
      return c.valor;
  }
}

/** `valor in (None, "")` */
export const ehVazia = (c: Celula) => c === null || c === "";

const d2 = (n: number) => String(n).padStart(2, "0");

/** `str(datetime(...))` */
export function strDatahora(ano: number, mes: number, dia: number, h = 0, mi = 0, s = 0, micro = 0): string {
  const base = `${String(ano).padStart(4, "0")}-${d2(mes)}-${d2(dia)} ${d2(h)}:${d2(mi)}:${d2(s)}`;
  return micro ? `${base}.${String(micro).padStart(6, "0")}` : base;
}

/** `str(time(...))` */
export function strHora(h: number, mi: number, s: number, micro = 0): string {
  const base = `${d2(h)}:${d2(mi)}:${d2(s)}`;
  return micro ? `${base}.${String(micro).padStart(6, "0")}` : base;
}

/** `str(timedelta(...))` a partir de dias, segundos (0 ≤ s < 86400) e microssegundos normalizados. */
export function strDuracao(dias: number, segundos: number, micro: number): string {
  const h = Math.floor(segundos / 3600);
  const mi = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  let t = `${h}:${d2(mi)}:${d2(s)}`;
  if (micro) t += `.${String(micro).padStart(6, "0")}`;
  if (dias) t = `${dias} day${Math.abs(dias) !== 1 ? "s" : ""}, ${t}`;
  return t;
}
