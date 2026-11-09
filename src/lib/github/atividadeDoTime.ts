import { COR_SEM_TIME, type ModoDeCor, type Paleta } from "./cores";
import type { GithubSummary } from "./types";

export type Lider = GithubSummary["leaders"][number];
export type TimeDaAtividade = { id: string; nome: string; cor: string; total: number; pessoas: Lider[] };
export type LinhasDaAtividade = { tipo: "times"; times: TimeDaAtividade[] } | { tipo: "pessoas"; pessoas: Lider[] };

/** Quantas pessoas o painel "Atividade do time" mostra; o resto fica no "Ver todos". */
export const PESSOAS_NO_PAINEL = 4;

// "Atividade do time" por time (05/11/2026): soma as pessoas de cada time; quem
// está sem time entra em "Sem time", sempre por último.
export function timesDaAtividade(leaders: Lider[], paleta: Paleta): TimeDaAtividade[] {
  const grupos = new Map<string, TimeDaAtividade>();
  for (const pessoa of leaders) {
    const time = paleta.times.find(item => item.id === paleta.pessoas[pessoa.id]?.time), id = time?.id ?? "";
    const grupo = grupos.get(id) ?? { id, nome: time?.nome ?? "Sem time", cor: time?.cor ?? COR_SEM_TIME, total: 0, pessoas: [] };
    grupo.total += pessoa.total; grupo.pessoas.push(pessoa); grupos.set(id, grupo);
  }
  return [...grupos.values()].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.total - a.total);
}

// Com um time escolhido em "Agrupar por" (09/11/2026), somar daria uma linha só, a
// do próprio time: o painel lista as pessoas dele, em ranking, como sem time escolhido.
// O servidor já devolve só as pessoas do time escolhido, na ordem do ranking.
export function linhasDaAtividade(leaders: Lider[], paleta: Paleta, modo: ModoDeCor, timeEscolhido: string | null): LinhasDaAtividade {
  if (modo === "time" && !timeEscolhido) return { tipo: "times", times: timesDaAtividade(leaders, paleta) };
  return { tipo: "pessoas", pessoas: leaders.slice(0, PESSOAS_NO_PAINEL) };
}

export type Contribuinte = { id: string; total: number; counts: Record<string, number> };
export type TimeContribuinte<C extends Contribuinte> = { id: string; nome: string; cor: string; total: number; counts: Record<string, number>; pessoas: C[] };

// Aba Repositórios com "Times · todos" (09/11/2026): o "Por desenvolvedor" vira "Por
// time", somando total e tipos das pessoas de cada time; Sem time por último.
export function timesDoRepositorio<C extends Contribuinte>(contribuintes: C[], paleta: Paleta): TimeContribuinte<C>[] {
  const grupos = new Map<string, TimeContribuinte<C>>();
  for (const pessoa of contribuintes) {
    const time = paleta.times.find(item => item.id === paleta.pessoas[pessoa.id]?.time), id = time?.id ?? "";
    const grupo = grupos.get(id) ?? { id, nome: time?.nome ?? "Sem time", cor: time?.cor ?? COR_SEM_TIME, total: 0, counts: {}, pessoas: [] };
    grupo.total += pessoa.total; grupo.pessoas.push(pessoa);
    for (const [tipo, n] of Object.entries(pessoa.counts)) grupo.counts[tipo] = (grupo.counts[tipo] ?? 0) + n;
    grupos.set(id, grupo);
  }
  return [...grupos.values()].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.total - a.total);
}
