// Porte de `extrato/_comum.py` (Fase 4, 10/11/2026): as primitivas que o leitor genérico e os
// leitores por banco compartilham. Datas são de calendário ("AAAA-MM-DD"), como o `date` do Python;
// dinheiro é `Dec` (decimal exato).

import { createHash } from "node:crypto";
import { decimal, NAO_FINITO, oposto, texto as textoDec, type Dec } from "../motor/decimal";
import type { TransacaoOfx } from "../motor/ofx";
import { corta, inteiro, ordenarPor, re, strip } from "./py";

/** A transação lida do extrato: a mesma forma da do OFX (`TransacaoOFX` no original). */
export type Transacao = TransacaoOfx;

/** Uma palavra com posição (`extract_words` do pdfplumber). */
export type Palavra = {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  upright?: boolean;
  chars?: Record<string, unknown>[];
  [extra: string]: unknown;
};

/**
 * Um trecho de extrato com cadeia de saldos própria (o Bradesco traz "Extrato" e "Últimos
 * Lançamentos" no mesmo arquivo, cada um com seu `SALDO ANTERIOR`).
 */
export type Bloco = {
  transacoes: Transacao[];
  saldoAnterior: Dec | null;
  saldoFinal: Dec | null;
};

export const bloco = (transacoes: Transacao[], saldoAnterior: Dec | null = null, saldoFinal: Dec | null = null): Bloco => ({
  transacoes,
  saldoAnterior,
  saldoFinal,
});

// ─── Datas ──────────────────────────────────────────────────────────────────

const d2 = (n: number) => String(n).padStart(2, "0");

/** `date(ano, mes, dia).isoformat()`, ou `null` quando o Python levantaria `ValueError`. */
export function dataIso(ano: number, mes: number, dia: number): string | null {
  if (!Number.isInteger(ano) || ano < 1 || ano > 9999 || mes < 1 || mes > 12 || dia < 1) return null;
  if (dia > diasNoMes(ano, mes)) return null;
  return `${String(ano).padStart(4, "0")}-${d2(mes)}-${d2(dia)}`;
}

export function diasNoMes(ano: number, mes: number): number {
  return [31, ehBissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
}

function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

export const anoDe = (iso: string) => Number(iso.slice(0, 4));
export const mesDe = (iso: string) => Number(iso.slice(5, 7));
export const diaDe = (iso: string) => Number(iso.slice(8, 10));

/** Dias de `a` até `b` (`(b - a).days`). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.UTC(anoDe(b), mesDe(b) - 1, diaDe(b)) - Date.UTC(anoDe(a), mesDe(a) - 1, diaDe(a))) / 86_400_000);
}

const DATE_FULL_RE = re("\\b(\\d{2})[/\\-](\\d{2})[/\\-](\\d{2,4})\\b");
const DATE_SHORT_RE = re("\\b(\\d{2})[/\\-](\\d{2})\\b");

/** Valor monetário brasileiro, com ou sem "R$", com sinal antes ou depois ("4.026,15-" do Itaú). */
export const MOEDA_RE = re("-?R?\\$?\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?");

export const MESES_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/**
 * `parse_data`: DD/MM/AAAA, DD/MM/AA ou DD/MM (sem ano). Sem ano e sem referência, o original usa o
 * ano corrente em UTC; aqui quem chama passa `anoAtual` (o relógio fica fora da função pura).
 */
export function parseData(s: string, referenciaAno: number | null = null, anoAtual = new Date().getUTCFullYear()): string | null {
  const t = strip(s);
  const m = DATE_FULL_RE.search(t);
  if (m) {
    let y = m[3]!;
    if (y.length === 2) y = "20" + y;
    const r = dataIso(inteiro(y), inteiro(m[2]!), inteiro(m[1]!));
    if (r) return r;
  }
  const m2 = DATE_SHORT_RE.search(t);
  if (m2) {
    const ano = referenciaAno || anoAtual;
    const r = dataIso(ano, inteiro(m2[2]!), inteiro(m2[1]!));
    if (r) return r;
  }
  return null;
}

const DATA_EXTENSO_RE = re("\\b(\\d{1,2})\\s+de\\s+([A-Za-zçÇãÃéÉ]+)\\s+de\\s+(\\d{4})\\b", "i");

/** `parse_data_extenso`: "2 de Janeiro de 2026", o cabeçalho de dia do Inter. */
export function parseDataExtenso(s: string): string | null {
  const m = DATA_EXTENSO_RE.search(strip(s));
  if (!m) return null;
  const mes = MESES_PT[m[2]!.toLowerCase()];
  if (!mes) return null;
  return dataIso(inteiro(m[3]!), mes, inteiro(m[1]!));
}

// ─── Valores ────────────────────────────────────────────────────────────────

/** `Decimal(texto)` como o Python: `null` para o que levantaria `InvalidOperation`. */
function decimalPy(texto: string): Dec | null {
  const d = decimal(texto);
  if (d === null) return null;
  if (d === NAO_FINITO) return null; // infinito/NaN não aparece em extrato; tratado como ilegível
  return d;
}

/** `str.lstrip(chars)` / `str.rstrip(chars)` */
function lstrip(s: string, chars: string): string {
  let i = 0;
  while (i < s.length && chars.includes(s[i])) i++;
  return s.slice(i);
}
function rstrip(s: string, chars: string): string {
  let i = s.length;
  while (i > 0 && chars.includes(s[i - 1])) i--;
  return s.slice(0, i);
}

const VALOR_US = re("^\\d{1,3}(,\\d{3})*\\.\\d{2}$");

/**
 * `parse_valor`: o valor impresso com o sinal que estiver nele — à esquerda ("-1.234,56"), entre
 * parênteses ("(1.234,56)") ou à direita ("1.234,56-", débito do Itaú).
 */
export function parseValor(entrada: string): Dec | null {
  let s = strip(entrada).replaceAll("R$", "").replaceAll(" ", "").replaceAll("\xa0", "");
  const negativo = s.startsWith("-") || s.startsWith("(") || s.endsWith("-");
  s = rstrip(lstrip(s, "-("), ")-");
  let val: Dec | null;
  if (VALOR_US.match(s)) val = decimalPy(s.replaceAll(",", ""));
  else if (s.includes(",") && s.includes(".")) val = decimalPy(s.replaceAll(".", "").replaceAll(",", "."));
  else if (s.includes(",")) val = decimalPy(s.replaceAll(",", "."));
  else val = decimalPy(s);
  if (val === null) return null;
  return negativo ? oposto(val) : val;
}

/** `gerar_fitid`: identidade da linha de PDF e planilha, que entra na chave de duplicidade. */
export function gerarFitid(data: string, historico: string, valor: Dec, idx: number): string {
  const bruto = `${data}${historico}${textoDec(valor)}${idx}`;
  return "PDF" + createHash("md5").update(bruto, "utf8").digest("hex").slice(0, 12).toUpperCase();
}

/** A transação como o `TransacaoOFX(...)` dos leitores monta, com o tipo pelo sinal. */
export function transacao(
  data: string,
  valor: Dec,
  historico: string,
  idx: number,
  extra: { saldoApos?: Dec | null; ordem?: number | null; fitid?: string; tipoOfx?: string } = {},
): Transacao {
  return {
    fitid: extra.fitid ?? gerarFitid(data, historico, valor, idx),
    data,
    valor,
    historico,
    tipoOfx: extra.tipoOfx ?? (valor.negativo && valor.coeficiente !== BigInt(0) ? "DEBIT" : "CREDIT"),
    saldoApos: extra.saldoApos ?? null,
    ordem: extra.ordem ?? null,
  };
}

// ─── Palavras e linhas ──────────────────────────────────────────────────────

/** Altura, em pontos, dentro da qual duas palavras são da mesma linha. */
export const ALTURA_LINHA = 3.0;

/**
 * `agrupar_linhas`: agrupa palavras em linhas comparando com o topo da linha em aberto (não por
 * faixa fixa). Cada linha sai ordenada por `x0`.
 */
export function agruparLinhas<P extends Palavra>(palavras: readonly P[], altura = ALTURA_LINHA): P[][] {
  if (!palavras.length) return [];
  const ordenadas = ordenarPor(palavras, (w) => [Number(w.top), Number(w.x0)]);
  const linhas: P[][] = [[ordenadas[0]]];
  let topo = Number(ordenadas[0].top);
  for (const p of ordenadas.slice(1)) {
    if (Number(p.top) - topo > altura) {
      linhas.push([]);
      topo = Number(p.top);
    }
    linhas[linhas.length - 1].push(p);
  }
  return linhas.map((l) => ordenarPor(l, (w) => Number(w.x0)));
}

/**
 * `colar_fragmentos`: cada fragmento de texto vai para o lançamento verticalmente mais próximo
 * (antes do histórico se estiver acima da linha de dados, depois se estiver abaixo).
 */
export function colarFragmentos(
  transacoes: readonly Transacao[],
  ancoras: readonly [number, number][],
  fragmentos: readonly [number, string][],
  distanciaMaxima = 20.0,
): Transacao[] {
  if (!ancoras.length) return [...transacoes];
  const resultado = [...transacoes];
  for (const [topo, texto] of fragmentos) {
    // min() do Python devolve o primeiro em caso de empate.
    let vizinha = ancoras[0];
    for (const a of ancoras) if (Math.abs(a[0] - topo) < Math.abs(vizinha[0] - topo)) vizinha = a;
    if (Math.abs(vizinha[0] - topo) > distanciaMaxima) continue;
    const posicao = vizinha[1];
    const alvo = resultado[posicao];
    const juntado = topo < vizinha[0] ? corta(strip(`${texto} ${alvo.historico}`), 200) : corta(strip(`${alvo.historico} ${texto}`), 200);
    resultado[posicao] = { ...alvo, historico: juntado };
  }
  return resultado;
}

/** `ordenar_do_mais_antigo`: inverte quando as datas vêm todas decrescentes; misturadas, ficam. */
export function ordenarDoMaisAntigo(transacoes: readonly Transacao[]): Transacao[] {
  if (transacoes.length < 2) return [...transacoes];
  const datas = transacoes.map((t) => t.data);
  if (datas.every((d, i) => i === 0 || datas[i - 1] <= d)) return [...transacoes];
  if (datas.every((d, i) => i === 0 || datas[i - 1] >= d)) return [...transacoes].reverse();
  return [...transacoes];
}

/** Rótulos de moeda que acompanham o nome da coluna no cabeçalho. */
export const SUFIXOS_MOEDA = ["r$", "rs", "(r$)"];

/** `borda_direita`: a borda direita da coluna cujo rótulo começa com `comecaCom`. */
export function bordaDireita(textos: readonly string[], palavras: readonly Palavra[], comecaCom: string, excluindo: readonly string[] = []): number | null {
  for (let i = 0; i < textos.length; i++) {
    const t = textos[i];
    if (!t.startsWith(comecaCom)) continue;
    if (excluindo.some((p) => t.startsWith(p))) continue;
    const seguinte = i + 1 < palavras.length ? palavras[i + 1] : null;
    if (seguinte && SUFIXOS_MOEDA.includes(String(seguinte.text).toLowerCase())) return Number(seguinte.x1);
    return Number(palavras[i].x1);
  }
  return null;
}
