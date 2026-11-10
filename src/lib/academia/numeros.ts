// A digitação de números (10/11/2026, pedido do Kauan; não existe no Hub): o
// texto é gerado a cada rodada, com o que a equipe de um escritório contábil
// digita no dia a dia — valores em reais, CNPJ, CPF, datas, competências,
// notas, CFOP, contas do plano de contas, NCM e percentuais.
//
// CNPJ e CPF saem só no formato, com dígitos sorteados: não são documentos de
// ninguém e não têm dígito verificador válido de propósito.
//
// Puro e com sorteio por semente: a mesma semente dá o mesmo texto (o servidor
// guarda a semente com a sessão, e os testes conferem o formato).

import type { Nivel } from "./regras";

/** Sorteio com semente (mulberry32): rápido, sem dependência e repetível. */
export function criarSorteio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Sorteio = () => number;

const inteiro = (s: Sorteio, min: number, max: number) => min + Math.floor(s() * (max - min + 1));
const digitos = (s: Sorteio, n: number) => Array.from({ length: n }, () => String(inteiro(s, 0, 9))).join("");
const p2 = (n: number) => String(n).padStart(2, "0");

/** 1234567 → "1.234.567". */
function milhar(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "R$ 12.480,35": reais até `teto`, com centavos. */
export function valorEmReais(s: Sorteio, teto: number): string {
  // Magnitude sorteada antes do valor: sem isso, quase todo valor sairia perto do teto.
  const casas = inteiro(s, 1, String(teto).length);
  const reais = Math.min(teto, inteiro(s, casas === 1 ? 0 : 10 ** (casas - 1), 10 ** casas - 1));
  return `R$ ${milhar(reais)},${p2(inteiro(s, 0, 99))}`;
}

export const cnpj = (s: Sorteio) => `${digitos(s, 2)}.${digitos(s, 3)}.${digitos(s, 3)}/000${inteiro(s, 1, 9)}-${digitos(s, 2)}`;
export const cpf = (s: Sorteio) => `${digitos(s, 3)}.${digitos(s, 3)}.${digitos(s, 3)}-${digitos(s, 2)}`;

const DIAS_NO_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Uma data que existe, de 2024 a 2027 ("15/11/2026"). */
export function data(s: Sorteio): string {
  const ano = inteiro(s, 2024, 2027);
  const mes = inteiro(s, 1, 12);
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const dia = inteiro(s, 1, mes === 2 && bissexto ? 29 : DIAS_NO_MES[mes - 1]);
  return `${p2(dia)}/${p2(mes)}/${ano}`;
}
export const competencia = (s: Sorteio) => `${p2(inteiro(s, 1, 12))}/${inteiro(s, 2024, 2027)}`;
export const notaFiscal = (s: Sorteio) => `NF ${digitos(s, 6)}`;
export const cfop = (s: Sorteio) => `${["1", "2", "5", "6"][inteiro(s, 0, 3)]}.${digitos(s, 3)}`;
/** Conta do plano de contas ("1.1.01.002"). */
export const contaContabil = (s: Sorteio) => `${inteiro(s, 1, 4)}.${inteiro(s, 1, 9)}.${digitos(s, 2)}.${digitos(s, 3)}`;
export const ncm = (s: Sorteio) => `${digitos(s, 4)}.${digitos(s, 2)}.${digitos(s, 2)}`;
export const percentual = (s: Sorteio) => `${inteiro(s, 0, 99)},${inteiro(s, 0, 9)}%`;
export const lote = (s: Sorteio) => `Lote ${inteiro(s, 2024, 2027)}/${digitos(s, 4)}`;

type Gerador = (s: Sorteio) => string;

/**
 * Cada nível: o que entra e o tamanho do texto. O tamanho é para caber no
 * relógio de 60 s de quem digita números com prática — a precisão do Hub
 * desconta o que ficou sem digitar.
 */
const NIVEIS: Record<Nivel, { geradores: Gerador[]; tamanho: number }> = {
  facil: {
    geradores: [(s) => valorEmReais(s, 999), data, competencia, (s) => valorEmReais(s, 99)],
    tamanho: 100,
  },
  medio: {
    geradores: [(s) => valorEmReais(s, 99_999), data, cnpj, notaFiscal, cfop, competencia],
    tamanho: 160,
  },
  dificil: {
    geradores: [(s) => valorEmReais(s, 9_999_999), cnpj, cpf, data, contaContabil, ncm, percentual, lote, notaFiscal],
    tamanho: 220,
  },
};

/** O texto de uma rodada: itens sorteados do nível, separados por espaço, até passar do tamanho. */
export function gerarTextoDeNumeros(nivel: Nivel, semente: number): string {
  const s = criarSorteio(semente);
  const { geradores, tamanho } = NIVEIS[nivel];
  const itens: string[] = [];
  let anterior = -1;
  while (itens.join(" ").length < tamanho) {
    // Sem o mesmo tipo duas vezes seguidas: o texto alterna como um extrato de verdade.
    let i = inteiro(s, 0, geradores.length - 1);
    if (i === anterior) i = (i + 1) % geradores.length;
    anterior = i;
    itens.push(geradores[i](s));
  }
  return itens.join(" ");
}

/** Uma semente nova, para o servidor sortear o texto da sessão. */
export const novaSemente = () => Math.floor(Math.random() * 2 ** 31);
