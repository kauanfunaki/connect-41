// O ritmo do período no Resumo do Controle interno (melhoria-822, 25/11/2026,
// alternativa B do Kauan): quantos itens foram concluídos e quantos entraram,
// por dia na semana, por semana no mês e por mês no ano. No dia não há o que
// desenhar — a tela mostra só os totais.
//
// Usa só as duas datas que o resumo já traz: a de conclusão (`em` dos
// concluídos) e a de entrada (`createdAt`). Não consulta nada nem muda o
// formato do resumo, que é o mesmo que o MCP devolve. Uma consequência: a
// entrada só conta itens que estão no resumo — um item que entrou no período
// e foi concluído ou cancelado depois dele não aparece nas entradas.

import type { IntervaloDoResumo, PeriodoDoResumo, ResumoDoPeriodo } from "./resumo";

const DIA_MS = 24 * 60 * 60 * 1000;
/** São Paulo é UTC−3 o ano todo, sem horário de verão desde 2019 (como em `intervaloDoResumo`). */
const FUSO_MS = 3 * 60 * 60 * 1000;
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const calendario = (dataIso: string) => new Date(`${dataIso}T00:00:00Z`);
const ddmm = (dataIso: string) => `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}`;

/** O dia de calendário, "AAAA-MM-DD", em que o instante cai em São Paulo. */
export function diaEmSaoPaulo(instante: Date): string {
  return iso(new Date(instante.getTime() - FUSO_MS));
}

export type AgrupamentoDoRitmo = "dia" | "semana" | "mes";

/** De quanto em quanto o gráfico agrupa: dia na semana, semana no mês, mês no ano; no dia, nada. */
export function agrupamentoDoRitmo(periodo: PeriodoDoResumo): AgrupamentoDoRitmo | null {
  return periodo === "semana" ? "dia" : periodo === "mes" ? "semana" : periodo === "ano" ? "mes" : null;
}

export type GrupoDoRitmo = {
  /** O primeiro dia do grupo, "AAAA-MM-DD" — também a chave. */
  primeiroDia: string;
  /** O último dia do grupo, já cortado no fim do período (a semana que passa do mês). */
  ultimoDia: string;
  /** O rótulo curto do eixo: "seg 23", "02/11", "jan". */
  rotulo: string;
  /** O rótulo por extenso, para a dica e a tabela acessível. */
  descricao: string;
  concluidos: number;
  entradas: number;
  /** O grupo que contém hoje. */
  contemHoje: boolean;
};

/** Os grupos vazios do período, na ordem, cada um com o primeiro e o último dia. */
function gruposVazios(agrupamento: AgrupamentoDoRitmo, primeiroDia: string, ultimoDia: string): { primeiroDia: string; ultimoDia: string }[] {
  const grupos: { primeiroDia: string; ultimoDia: string }[] = [];
  const fim = calendario(ultimoDia).getTime();
  let d = calendario(primeiroDia);
  while (d.getTime() <= fim) {
    let depois: Date;
    if (agrupamento === "dia") depois = new Date(d.getTime() + DIA_MS);
    // A semana vai de segunda a domingo, como no resumo; a primeira e a última
    // do mês saem cortadas nas bordas dele.
    else if (agrupamento === "semana") depois = new Date(d.getTime() + (7 - ((d.getUTCDay() + 6) % 7)) * DIA_MS);
    else depois = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const ultimo = Math.min(depois.getTime() - DIA_MS, fim);
    grupos.push({ primeiroDia: iso(d), ultimoDia: iso(new Date(ultimo)) });
    d = depois;
  }
  return grupos;
}

function rotulos(agrupamento: AgrupamentoDoRitmo, primeiroDia: string, ultimoDia: string): { rotulo: string; descricao: string } {
  const d = calendario(primeiroDia);
  if (agrupamento === "dia") return { rotulo: `${DIAS_DA_SEMANA[d.getUTCDay()]} ${primeiroDia.slice(8, 10)}`, descricao: `${DIAS_DA_SEMANA[d.getUTCDay()]}, ${ddmm(primeiroDia)}` };
  if (agrupamento === "semana") return { rotulo: ddmm(primeiroDia), descricao: primeiroDia === ultimoDia ? ddmm(primeiroDia) : `${ddmm(primeiroDia)} a ${ddmm(ultimoDia)}` };
  const mes = MESES_CURTOS[d.getUTCMonth()];
  return { rotulo: mes, descricao: `${mes}/${d.getUTCFullYear()}` };
}

/**
 * Concluídos e entradas do período, agrupados. Concluído conta pela data de
 * conclusão; entrada, pela data de criação de qualquer item do resumo
 * (concluído, em andamento, planejado ou cancelado). `null` no período "dia".
 */
export function ritmoDoPeriodo(
  periodo: PeriodoDoResumo,
  intervalo: Pick<IntervaloDoResumo, "primeiroDia" | "ultimoDia">,
  r: ResumoDoPeriodo,
  hoje: string,
): GrupoDoRitmo[] | null {
  const agrupamento = agrupamentoDoRitmo(periodo);
  if (!agrupamento) return null;
  const grupos: GrupoDoRitmo[] = gruposVazios(agrupamento, intervalo.primeiroDia, intervalo.ultimoDia).map((g) => ({
    ...g,
    ...rotulos(agrupamento, g.primeiroDia, g.ultimoDia),
    concluidos: 0,
    entradas: 0,
    contemHoje: g.primeiroDia <= hoje && hoje <= g.ultimoDia,
  }));
  // Os grupos estão em ordem e não se sobrepõem: o do dia é o último que começa até ele.
  const grupoDo = (dia: string) => {
    if (dia < intervalo.primeiroDia || dia > intervalo.ultimoDia) return null;
    for (let i = grupos.length - 1; i >= 0; i--) if (grupos[i].primeiroDia <= dia) return grupos[i];
    return null;
  };

  for (const i of r.concluidos) {
    const g = grupoDo(diaEmSaoPaulo(i.em));
    if (g) g.concluidos++;
  }
  // As quatro listas não se repetem (cada item está numa situação só), mas o
  // Set garante que um item conte uma entrada só.
  const vistos = new Set<string>();
  for (const i of [...r.concluidos, ...r.emAndamento, ...r.planejados, ...r.cancelados]) {
    if (vistos.has(i.id)) continue;
    vistos.add(i.id);
    const g = grupoDo(diaEmSaoPaulo(i.createdAt));
    if (g) g.entradas++;
  }
  return grupos;
}
