// O desafio do dia e a sequência de dias (Academia, Fase 2, 11/11/2026 —
// Controle interno funcionalidade-594, escolhas do Kauan em 10/11). Puro, sem
// banco: o servidor lê os dias em que a pessoa fez o desafio e passa para cá.
//
// A sequência conta os dias com o desafio feito, seguidos:
//   - sábado e domingo não quebram (e contam, se a pessoa fizer);
//   - um dia útil perdido por semana é perdoado ("uma folga por semana"; a
//     semana vai de segunda a domingo, como a ISO);
//   - o segundo dia útil perdido na mesma semana zera;
//   - hoje ainda sem o desafio não quebra nada: o dia não acabou.

import { diaDaSemana, ehFimDeSemana, somarDias } from "@/lib/datas/calendario";

/** A partir de quantos dias seguidos a chama aparece no chapéu do topo. */
export const SEQUENCIA_MINIMA_DA_CHAMA = 2;

/** A segunda-feira da semana do dia — a chave da "folga da semana". */
export const segundaDaSemana = (dia: string) => somarDias(dia, -diaDaSemana(dia));

export type Sequencia = {
  /** Os dias da sequência de agora (só os feitos contam). */
  atual: number;
  /** A maior sequência que a pessoa já fez. */
  maior: number;
  feitoHoje: boolean;
  /** A folga desta semana já foi usada na sequência de agora. */
  folgaUsada: boolean;
};

/**
 * A sequência a partir dos dias feitos ("AAAA-MM-DD", em qualquer ordem e com
 * repetição) até `hoje`. Dias depois de hoje são ignorados.
 */
export function sequenciaDeDias(feitos: Iterable<string>, hoje: string): Sequencia {
  const dias = new Set([...feitos].filter((d) => d <= hoje));
  if (dias.size === 0) return { atual: 0, maior: 0, feitoHoje: false, folgaUsada: false };
  const primeiro = [...dias].sort()[0];
  let atual = 0;
  let maior = 0;
  // A semana (segunda) em que a folga já foi usada. Fica mesmo quando a
  // sequência zera: a semana teve a sua folga.
  let folga: string | null = null;
  for (let d = primeiro; d <= hoje; d = somarDias(d, 1)) {
    if (dias.has(d)) {
      atual++;
      if (atual > maior) maior = atual;
      continue;
    }
    if (d === hoje || ehFimDeSemana(d) || atual === 0) continue;
    const semana = segundaDaSemana(d);
    if (folga === semana) atual = 0;
    else folga = semana;
  }
  return { atual, maior, feitoHoje: dias.has(hoje), folgaUsada: atual > 0 && folga === segundaDaSemana(hoje) };
}

/** "1 dia", "5 dias". */
export const diasEmTexto = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/**
 * Qual texto do banco é o desafio do dia: o mesmo para todo mundo, pela data
 * de São Paulo. Um hash simples (FNV-1a) do dia, para os dias seguidos não
 * pegarem textos vizinhos. `quantos` é o número de textos ativos.
 */
export function indiceDoDesafio(dia: string, quantos: number): number {
  if (quantos <= 0) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < dia.length; i++) {
    h ^= dia.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % quantos;
}
