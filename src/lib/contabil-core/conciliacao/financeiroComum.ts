// O que os leitores de documentos do financeiro compartilham (Bloco B, Fase B4, 12/11/2026): a recusa,
// os limites e a leitura de texto, valor e data de uma célula ou de um trecho do PDF. Porte das funções
// do topo de `conciliacao_bancaria/financeiro_documentos.py` (`_normalizar`, `_texto`, `_valor`,
// `_data_planilha`), que `financeiro_omie.py` e `financeiro_titulos.py` importam de lá. Aqui ficam num
// arquivo próprio para os três leitores não se importarem em círculo.

import { compara, decimal, ehZero, modulo, NAO_FINITO, reescala, subtrai, dec, type Dec } from "../motor/decimal";
import { casefold, combinante } from "../motor/unicodePy";
import { strPy, type Celula } from "../planilha/celula";
import { re, split, strip } from "../extrato/py";
import { ou, strptimeDmy } from "./folhas";

/** Documento incompleto, layout desconhecido ou valores não conferidos (`FinanceiroInvalido`, um `ValueError`). */
export class FinanceiroInvalido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "FinanceiroInvalido";
  }
}

export const MAX_BYTES_FINANCEIRO = 25 * 1024 * 1024;
export const MAX_LINHAS_FINANCEIRO = 20_000;
export const MAX_PAGINAS_FINANCEIRO = 100;
export const MAX_CARACTERES_PAGINA = 150_000;
export const MAX_SEGUNDOS_PDF = 30;
export const MAX_VALOR_FINANCEIRO = dec("9999999999999.99");
export const DINHEIRO = re("[+-]?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2}");

const CENTAVOS = -2;
const PRECISAO = 28;
const RUIDO = dec("0.00000001");

/** `_normalizar`: sem acento, `casefold` e com um espaço só entre as palavras. */
export function normalizarFinanceiro(valor: Celula): string {
  const t = casefold(strip(strPy(ou(valor, "")))).normalize("NFKD");
  return split(Array.from(t).filter((c) => !combinante(c)).join("")).join(" ");
}

/** `str(int(numero))` de um Decimal inteiro (o `int()` corta a fração, que aqui é zero). */
function inteiroDoDecimal(d: Dec): string {
  let c = d.coeficiente;
  if (d.expoente >= 0) c *= BigInt(10) ** BigInt(d.expoente);
  else c /= BigInt(10) ** BigInt(-d.expoente);
  return (d.negativo && c !== BigInt(0) ? "-" : "") + c.toString();
}

/** O Decimal é inteiro (`numero == numero.to_integral_value()`)? */
function ehInteiro(d: Dec): boolean {
  if (d.expoente >= 0 || ehZero(d)) return true;
  return d.coeficiente % BigInt(10) ** BigInt(-d.expoente) === BigInt(0);
}

/** `_texto`: o texto da célula com um espaço só entre as palavras; número inteiro sem ".0"; vazio é `null`. */
export function textoFinanceiro(valor: Celula): string | null {
  if (valor === null || valor === "") return null;
  if (typeof valor !== "string") {
    if (valor.tipo === "bool") throw new FinanceiroInvalido("Campo textual inválido no documento do financeiro.");
    if (valor.tipo === "int" || valor.tipo === "float") {
      const numero = decimal(strPy(valor));
      if (numero === NAO_FINITO || numero === null) throw new FinanceiroInvalido("Número inválido no documento do financeiro.");
      if (ehInteiro(numero)) return inteiroDoDecimal(numero);
    }
  }
  return split(strPy(valor)).join(" ");
}

/** `quantize(Decimal("0.01"))`, ou `null` onde o Python levanta `InvalidOperation` (mais de 28 dígitos). */
function quantizar(d: Dec): Dec | null {
  const q = reescala(d, CENTAVOS);
  return q.coeficiente.toString().length > PRECISAO ? null : q;
}

/**
 * `_valor`: o valor com duas casas. Texto só no formato brasileiro ("1.234,56", com "R$" opcional);
 * número da planilha só com ruído de ponto flutuante além dos centavos. Sem `assinado`, negativo é recusado.
 */
export function valorFinanceiro(valor: Celula, contexto: string, assinado = false): Dec {
  if (valor === null || (typeof valor !== "string" && valor.tipo === "bool")) {
    throw new FinanceiroInvalido(`Valor ausente ou inválido em ${contexto}.`);
  }
  let fonte: string;
  if (typeof valor === "string") {
    let t = strip(valor);
    if (t.startsWith("R$")) t = t.slice(2);
    t = strip(t).replaceAll(" ", "");
    if (!DINHEIRO.fullmatch(t)) throw new FinanceiroInvalido(`Valor inválido em ${contexto}.`);
    fonte = t.replaceAll(".", "").replaceAll(",", ".");
  } else {
    fonte = strPy(valor);
  }
  const numero = decimal(fonte);
  if (numero === null || numero === NAO_FINITO) throw new FinanceiroInvalido(`Valor inválido em ${contexto}.`);
  const arredondado = quantizar(numero);
  // Exportações Excel podem guardar 245698.99000000005: só esse ruído de representação é aceito.
  if (arredondado === null || compara(modulo(subtrai(numero, arredondado)), RUIDO) > 0) {
    throw new FinanceiroInvalido(`Valor inválido em ${contexto}.`);
  }
  if (!assinado && arredondado.negativo && !ehZero(arredondado)) throw new FinanceiroInvalido(`Valor negativo inesperado em ${contexto}.`);
  if (compara(modulo(arredondado), MAX_VALOR_FINANCEIRO) > 0) throw new FinanceiroInvalido(`Valor excede o limite financeiro em ${contexto}.`);
  return arredondado;
}

/** `_data_planilha`: data da célula (datetime ou "dd/mm/aaaa"), como "AAAA-MM-DD". */
export function dataFinanceiro(valor: Celula, contexto: string): string {
  if (valor !== null && typeof valor !== "string" && valor.tipo === "datahora") return valor.valor.slice(0, 10);
  if (typeof valor === "string") {
    const data = strptimeDmy(strip(valor));
    if (data !== null) return data;
  }
  throw new FinanceiroInvalido(`Data ausente ou inválida em ${contexto}.`);
}
