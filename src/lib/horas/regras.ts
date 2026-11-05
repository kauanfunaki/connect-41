// As regras das horas lançadas (04/11/2026, lote D dos ajustes de 03/11 —
// "horas trabalhadas sem depender da boa-fé de quem lança", opções A e C).
// Puro, sem banco: as actions do processo e do card leem daqui.

/** Lançamento à mão com mais dias de atraso que isto só a coordenação faz. */
export const DIAS_PARA_LANCAR_SEM_COORDENACAO = 7;

/** Cronômetro com mais que isto é sinal de que ficou ligado: a tela pede para conferir. */
export const MINUTOS_DE_CRONOMETRO_LONGO = 4 * 60;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Quantos dias o dia lançado está atrás de hoje ("AAAA-MM-DD"); negativo = no futuro. */
export function diasDeAtraso(diaKey: string, hojeKey: string): number {
  return Math.round((Date.parse(`${hojeKey}T12:00:00Z`) - Date.parse(`${diaKey}T12:00:00Z`)) / DIA_MS);
}

/** A recusa do lançamento atrasado, ou nulo quando pode. */
export function recusaDoLancamentoAtrasado(diaKey: string, hojeKey: string, coordena: boolean): string | null {
  if (coordena) return null;
  return diasDeAtraso(diaKey, hojeKey) > DIAS_PARA_LANCAR_SEM_COORDENACAO
    ? `Lançamento com mais de ${DIAS_PARA_LANCAR_SEM_COORDENACAO} dias de atraso: peça à coordenação do setor para lançar.`
    : null;
}

export type OrigemDaHora = "CRONOMETRO" | "MANUAL" | null;

/** O selo da origem na lista: de onde veio, e se mexeram depois. */
export function seloDaOrigem(origem: OrigemDaHora, editada: boolean, minutos: number): { texto: string; alerta: boolean } {
  if (origem === "CRONOMETRO") {
    if (editada) return { texto: "cronômetro, corrigido", alerta: false };
    if (minutos > MINUTOS_DE_CRONOMETRO_LONGO) return { texto: "cronômetro longo — confira", alerta: true };
    return { texto: "cronômetro", alerta: false };
  }
  if (origem === "MANUAL") return { texto: editada ? "à mão, corrigido" : "à mão", alerta: false };
  return { texto: "antes de 04/11", alerta: false };
}

/** O rastro do dia: quantas ações a pessoa registrou no processo naquele dia. */
export function rastroDoDia(acoes: number): { texto: string; alerta: boolean } {
  if (acoes <= 0) return { texto: "sem ação registrada no processo neste dia", alerta: true };
  return { texto: acoes === 1 ? "1 ação no processo neste dia" : `${acoes} ações no processo neste dia`, alerta: false };
}
