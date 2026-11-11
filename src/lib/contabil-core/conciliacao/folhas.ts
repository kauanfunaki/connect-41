// As folhas de uma planilha da conciliação bancária (Bloco B, 11/11/2026) e as células como o Python
// as vê. A leitura é o `_ler_folhas` de `conciliacao_bancaria/apoio.py`, portado uma vez só em
// `apoio.ts`; a consulta do SISPAG e o extrato detalhado do Itaú leem a planilha por aqui, como no
// original.

import { decimal, NAO_FINITO, reescala, type Dec } from "../motor/decimal";
import { strPy, type Celula } from "../planilha/celula";
import { inteiro, strip } from "../extrato/py";
import { lerFolhas as lerFolhasDoApoio } from "./apoio";

/** `RazaoApoioInvalido` levantado por `_ler_folhas`. */
export { RazaoApoioInvalido as FolhasInvalidas } from "./razaoTipos";

/** Uma folha: o título e as linhas, cada uma como a tupla do openpyxl ou do xlrd. */
export type Folha = { nome: string; linhas: Celula[][] };

/** `_ler_folhas` do `apoio.py` (o mesmo porte do Razão auxiliar), com todas as folhas lidas de uma vez. */
export function lerFolhas(bytes: Uint8Array): Folha[] {
  return [...lerFolhasDoApoio(bytes)].map(([nome, linhas]) => ({ nome, linhas }));
}

// ─── A célula como o Python a vê ────────────────────────────────────────────

/** Verdade do Python (`celula or ""`): zero, texto vazio, `False` e `timedelta(0)` são falsos. */
export function verdadeira(c: Celula): boolean {
  if (c === null) return false;
  if (typeof c === "string") return c.length > 0;
  switch (c.tipo) {
    case "int":
      return c.valor !== BigInt(0);
    case "float":
      return c.valor !== 0;
    case "bool":
      return c.valor;
    case "duracao":
      return c.valor !== "0:00:00";
    default:
      return true;
  }
}

/** `celula or padrao` */
export const ou = (c: Celula, padrao: string): Celula => (verdadeira(c) ? c : padrao);

const DIAS_NO_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const bissexto = (a: number) => a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0);
// O padrão de `%d/%m/%Y` no `_strptime` (o `\d` do Python é Unicode).
const DMY = /^(3[0-1]|[1-2]\p{Nd}|0[1-9]|[1-9]| [1-9])\/(1[0-2]|0[1-9]|[1-9])\/(\p{Nd}\p{Nd}\p{Nd}\p{Nd})$/u;

/** `datetime.strptime(texto, "%d/%m/%Y").date()` como "AAAA-MM-DD", ou `null` no `ValueError`. */
export function strptimeDmy(texto: string): string | null {
  const m = DMY.exec(texto);
  if (!m) return null;
  const dia = inteiro(m[1]);
  const mes = inteiro(m[2]);
  const ano = inteiro(m[3]);
  if (ano < 1) return null;
  const limite = mes === 2 && bissexto(ano) ? 29 : DIAS_NO_MES[mes - 1];
  if (dia > limite) return null;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** `decimal.InvalidOperation`, que o original deixa escapar no ramo do número. */
export class OperacaoInvalida extends Error {
  constructor() {
    super("[<class 'decimal.InvalidOperation'>]");
    this.name = "InvalidOperation";
  }
}

const CENTAVOS = -2;
const PRECISAO = 28;

/** `d.quantize(Decimal("0.01"))` no contexto padrão; `null` onde o Python levanta `InvalidOperation`. */
function quantizar(d: Dec | typeof NAO_FINITO | null): Dec | null {
  if (d === null || d === NAO_FINITO) return null;
  const q = reescala(d, CENTAVOS);
  return q.coeficiente.toString().length > PRECISAO ? null : q;
}

/**
 * `_decimal` do SISPAG e do extrato detalhado: número da célula (`int`/`float`) por `str()`, texto no
 * formato brasileiro ("1.234,56"), sempre com duas casas.
 */
export function decimalDaCelula(valor: Celula): Dec | null {
  if (valor !== null && typeof valor !== "string" && (valor.tipo === "int" || valor.tipo === "float")) {
    const q = quantizar(decimal(strPy(valor)));
    if (q === null) throw new OperacaoInvalida();
    return q;
  }
  const texto = strip(strPy(ou(valor, ""))).replaceAll(".", "").replaceAll(",", ".");
  return quantizar(decimal(texto));
}

/** `f"{data:%d/%m/%Y}"` de uma data "AAAA-MM-DD". */
export const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
