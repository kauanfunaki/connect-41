// Média de variáveis do DP 2 (11/11/2026): o que entra em férias, 13º e
// rescisão a partir das competências fechadas.
//
// Soma, por competência, as linhas do holerite que entram na média do cálculo
// pedido — férias, 13º ou rescisão, marcados em cada rubrica (horas extras,
// adicional noturno, DSR, comissões…) — e tira a média dos meses que existem
// na janela: quem tem 4 meses de casa tem média de 4 meses.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { reais } from "./formato";

/** O cálculo que usa a média (17/11/2026, melhoria-742): cada rubrica marca em quais entra. */
export type TipoDeMedia = "FERIAS" | "DECIMO" | "RESCISAO";

export const CAMPO_DA_MEDIA = { FERIAS: "mediaFerias", DECIMO: "mediaDecimo", RESCISAO: "mediaRescisao" } as const;

/**
 * Uma linha do holerite guardado. As competências fechadas antes de 17/11/2026
 * só têm `entraNaMedia` (uma marcação para tudo): vale para os três tipos.
 */
export type ItemDaMedia = { valor: number; tipo: string; mediaFerias?: boolean; mediaDecimo?: boolean; mediaRescisao?: boolean; entraNaMedia?: boolean };

export type MesDaMedia = { competencia: string; itens: readonly ItemDaMedia[] };

export function entraNaMediaDe(i: ItemDaMedia, tipo: TipoDeMedia): boolean {
  return i[CAMPO_DA_MEDIA[tipo]] ?? i.entraNaMedia ?? false;
}

export function mediaDeVariaveis(meses: readonly MesDaMedia[], tipo: TipoDeMedia): { media: number; meses: number; memoria: string } {
  if (meses.length === 0) return { media: 0, meses: 0, memoria: "Sem competências fechadas na janela: média zero." };
  let total = 0;
  const partes: string[] = [];
  for (const m of meses) {
    let doMes = 0;
    for (const i of m.itens) if (entraNaMediaDe(i, tipo) && i.tipo === "PROVENTO") doMes += i.valor;
    total += doMes;
    partes.push(`${m.competencia}: ${reais(r2(doMes))}`);
  }
  const media = r2(total / meses.length);
  return { media, meses: meses.length, memoria: `${partes.join(" · ")} → ${reais(r2(total))} ÷ ${meses.length} = ${reais(media)}` };
}
