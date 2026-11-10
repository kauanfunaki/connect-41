// O `Decimal` do Python no que o Contábil Core usa: construir a partir de texto, somar, comparar,
// tirar o módulo e formatar (`str()`, `f"{d:f}"` e `f"{d:.2f}"`).
//
// O original nunca usa ponto flutuante para dinheiro, e o porte também não pode: 0,1 + 0,2 em
// `number` dá 0,30000000000000004, e um centavo de diferença na conferência de saldo vira alerta
// falso. Aqui o valor é um inteiro grande (`bigint`) vezes uma potência de dez, como no Python.
//
// Fora do escopo, porque o original não chega lá com valores de extrato: a precisão de 28 dígitos
// do contexto padrão (as somas aqui são exatas) e as operações que não aparecem no código portado.

import { digitoUnicode, strip } from "./unicodePy";

/** Um número decimal exato: (-1)^negativo × coeficiente × 10^expoente. */
export type Dec = {
  readonly negativo: boolean;
  readonly coeficiente: bigint;
  readonly expoente: number;
};

/** Texto que o `Decimal()` aceita mas que não é número finito: `Infinity`, `NaN`, `sNaN`. */
export const NAO_FINITO = Symbol("nao-finito");

const ESPECIAL = /^[+-]?(?:inf|infinity|s?nan\d*)$/i;

function asciiDigitos(texto: string): string | null {
  let out = "";
  for (const c of texto) {
    if (c >= "0" && c <= "9") out += c;
    else {
      const v = digitoUnicode(c);
      if (v === null) return null;
      out += String(v);
    }
  }
  return out;
}

/**
 * `Decimal(texto)`. Devolve `null` quando o Python levantaria `InvalidOperation` e `NAO_FINITO` para
 * infinito e NaN. Aceita, como o Python, espaço nas pontas, `_` entre dígitos e dígito de qualquer
 * escrita (árabe, devanágari…).
 */
export function decimal(texto: string): Dec | typeof NAO_FINITO | null {
  const t = strip(texto);
  if (ESPECIAL.test(t)) return NAO_FINITO;
  const m = /^([+-])?(?:([\p{Nd}](?:_?[\p{Nd}])*)(?:\.((?:[\p{Nd}](?:_?[\p{Nd}])*)?))?|\.([\p{Nd}](?:_?[\p{Nd}])*))(?:[eE]([+-]?[\p{Nd}](?:_?[\p{Nd}])*))?$/u.exec(t);
  if (!m) return null;
  const inteiro = asciiDigitos((m[2] ?? "").replace(/_/g, ""));
  const fracao = asciiDigitos((m[3] ?? m[4] ?? "").replace(/_/g, ""));
  const exp = asciiDigitos((m[5] ?? "0").replace(/_/g, "").replace(/^[+-]/, ""));
  if (inteiro === null || fracao === null || exp === null) return null;
  const sinalExp = (m[5] ?? "").startsWith("-") ? -1 : 1;
  const digitos = (inteiro + fracao) || "0";
  return {
    negativo: m[1] === "-",
    coeficiente: BigInt(digitos),
    expoente: sinalExp * Number(exp) - fracao.length,
  };
}

/** `Decimal(texto)` de um texto que o chamador já sabe ser número (constantes, testes). */
export function dec(texto: string): Dec {
  const d = decimal(texto);
  if (d === null || d === NAO_FINITO) throw new Error(`Decimal inválido: ${texto}`);
  return d;
}

/** Decimal de centavos inteiros (o que vem do banco como `Decimal(15,2)`). */
export function deCentavos(centavos: bigint): Dec {
  return { negativo: centavos < BigInt(0), coeficiente: centavos < BigInt(0) ? -centavos : centavos, expoente: -2 };
}

const DEZ = BigInt(10);
function pot10(n: number): bigint {
  return DEZ ** BigInt(n);
}

function assinado(d: Dec): bigint {
  return d.negativo ? -d.coeficiente : d.coeficiente;
}

function alinhar(a: Dec, b: Dec): [bigint, bigint, number] {
  const e = Math.min(a.expoente, b.expoente);
  return [assinado(a) * pot10(a.expoente - e), assinado(b) * pot10(b.expoente - e), e];
}

/** `a + b`: exato, com o expoente do menor, e zero negativo só se as duas parcelas forem negativas. */
export function soma(a: Dec, b: Dec): Dec {
  const [x, y, e] = alinhar(a, b);
  const r = x + y;
  if (r === BigInt(0)) return { negativo: a.negativo && b.negativo, coeficiente: BigInt(0), expoente: e };
  return { negativo: r < BigInt(0), coeficiente: r < BigInt(0) ? -r : r, expoente: e };
}

/** `-d`: como no Python, o oposto de zero é zero positivo (`-Decimal("0.00")` dá `0.00`). */
export function oposto(d: Dec): Dec {
  if (d.coeficiente === BigInt(0)) return { ...d, negativo: false };
  return { ...d, negativo: !d.negativo };
}

/** `a - b` */
export function subtrai(a: Dec, b: Dec): Dec {
  const [x, y, e] = alinhar(a, b);
  const r = x - y;
  if (r === BigInt(0)) return { negativo: a.negativo && !b.negativo, coeficiente: BigInt(0), expoente: e };
  return { negativo: r < BigInt(0), coeficiente: r < BigInt(0) ? -r : r, expoente: e };
}

/** `abs(d)` */
export function modulo(d: Dec): Dec {
  return d.negativo ? { ...d, negativo: false } : d;
}

/** Compara pelo valor (`Decimal("1.0") == Decimal("1")`): negativo, zero ou positivo. */
export function compara(a: Dec, b: Dec): number {
  const [x, y] = alinhar(a, b);
  return x === y ? 0 : x < y ? -1 : 1;
}

export function igual(a: Dec, b: Dec): boolean {
  return compara(a, b) === 0;
}

export function ehZero(d: Dec): boolean {
  return d.coeficiente === BigInt(0);
}

/** `d >= 0` (zero negativo também é ≥ 0, como no Python). */
export function naoNegativo(d: Dec): boolean {
  return ehZero(d) || !d.negativo;
}

/** `sum(valores, Decimal("0"))` */
export function somaTodos(valores: Iterable<Dec>): Dec {
  let total: Dec = { negativo: false, coeficiente: BigInt(0), expoente: 0 };
  for (const v of valores) total = soma(total, v);
  return total;
}

/** `str(d)`: a notação do Python, científica quando o expoente é positivo ou muito negativo. */
export function texto(d: Dec): string {
  const c = d.coeficiente.toString();
  const ajustado = d.expoente + c.length - 1;
  const sinal = d.negativo ? "-" : "";
  if (d.expoente <= 0 && ajustado >= -6) {
    if (d.expoente === 0) return sinal + c;
    const ponto = c.length + d.expoente;
    if (ponto > 0) return `${sinal}${c.slice(0, ponto)}.${c.slice(ponto)}`;
    return `${sinal}0.${"0".repeat(-ponto)}${c}`;
  }
  const mantissa = c.length > 1 ? `${c[0]}.${c.slice(1)}` : c;
  return `${sinal}${mantissa}E${ajustado >= 0 ? "+" : ""}${ajustado}`;
}

/** Arredonda para `10^expoente` meio-para-par (o `ROUND_HALF_EVEN` do contexto padrão). */
export function reescala(d: Dec, expoente: number): Dec {
  if (d.expoente >= expoente) {
    return { ...d, coeficiente: d.coeficiente * pot10(d.expoente - expoente), expoente };
  }
  const divisor = pot10(expoente - d.expoente);
  let q = d.coeficiente / divisor;
  const r = d.coeficiente % divisor;
  const dobro = r * BigInt(2);
  if (dobro > divisor || (dobro === divisor && q % BigInt(2) === BigInt(1))) q += BigInt(1);
  return { negativo: d.negativo, coeficiente: q, expoente };
}

/** `format(d, "f")` ou `format(d, ".Nf")` do Python. */
export function fixo(d: Dec, casas?: number): string {
  let x = casas === undefined ? d : reescala(d, -casas);
  // Zero com expoente positivo não cabe em ponto fixo: o Python reescala para 0e0.
  if (ehZero(x) && x.expoente > 0) x = { ...x, expoente: 0, coeficiente: BigInt(0) };
  const digitos = x.coeficiente.toString();
  const lugar = x.expoente + digitos.length;
  let inteira: string;
  let fracao: string;
  if (lugar < 0) {
    inteira = "0";
    fracao = "0".repeat(-lugar) + digitos;
  } else if (lugar > digitos.length) {
    inteira = digitos + "0".repeat(lugar - digitos.length);
    fracao = "";
  } else {
    inteira = digitos.slice(0, lugar) || "0";
    fracao = digitos.slice(lugar);
  }
  return (x.negativo ? "-" : "") + inteira + (fracao ? "." + fracao : "");
}

/**
 * Centavos para gravar em `Decimal(15,2)`: o PostgreSQL (e o MySQL) arredondam meio para longe do
 * zero ao ajustar a escala. Valor com mais de duas casas é raro em extrato, mas o OFX permite.
 */
export function centavosDoBanco(d: Dec): bigint {
  const e = d.expoente + 2;
  let c: bigint;
  if (e >= 0) c = d.coeficiente * pot10(e);
  else {
    const divisor = pot10(-e);
    c = d.coeficiente / divisor;
    if ((d.coeficiente % divisor) * BigInt(2) >= divisor) c += BigInt(1);
  }
  return d.negativo ? -c : c;
}
