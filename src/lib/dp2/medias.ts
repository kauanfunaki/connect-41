// Média de variáveis do DP 2 (11/11/2026): o que entra em férias, 13º e
// rescisão a partir das competências fechadas.
//
// Soma, por competência, as linhas do holerite com "entra na média" (horas
// extras, adicional noturno, DSR, comissões…) e tira a média dos meses que
// existem na janela — quem tem 4 meses de casa tem média de 4 meses.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { reais } from "./formato";

export type MesDaMedia = { competencia: string; itens: readonly { valor: number; entraNaMedia: boolean; tipo: string }[] };

export function mediaDeVariaveis(meses: readonly MesDaMedia[]): { media: number; meses: number; memoria: string } {
  if (meses.length === 0) return { media: 0, meses: 0, memoria: "Sem competências fechadas na janela: média zero." };
  let total = 0;
  const partes: string[] = [];
  for (const m of meses) {
    let doMes = 0;
    for (const i of m.itens) if (i.entraNaMedia && i.tipo === "PROVENTO") doMes += i.valor;
    total += doMes;
    partes.push(`${m.competencia}: ${reais(r2(doMes))}`);
  }
  const media = r2(total / meses.length);
  return { media, meses: meses.length, memoria: `${partes.join(" · ")} → ${reais(r2(total))} ÷ ${meses.length} = ${reais(media)}` };
}
