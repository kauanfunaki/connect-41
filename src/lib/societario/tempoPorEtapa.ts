// Tempo por etapa (04/11/2026): o quinto relatório do Societário, que o desenho
// dos Relatórios (B) já deixava no lugar. Quanto cada etapa do roteiro leva,
// por tipo de processo, nas etapas concluídas no período — em dias úteis, com
// os feriados do escritório, como o prazo do processo. Puro e testado.

export type EtapaConcluida = {
  tipoNome: string;
  /** A posição da etapa no roteiro: ordena as etapas do mesmo tipo. */
  posicao: number;
  etapa: string;
  diasUteis: number;
};

export type LinhaDoTempoPorEtapa = {
  chave: string;
  tipoNome: string;
  etapa: string;
  posicao: number;
  concluidas: number;
  medianaDias: number;
  maximoDias: number;
};

function mediana(valores: number[]): number {
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Uma linha por tipo e etapa, na ordem do roteiro; o tipo com mais etapas concluídas primeiro. */
export function tempoPorEtapa(etapas: EtapaConcluida[]): LinhaDoTempoPorEtapa[] {
  const por = new Map<string, { tipoNome: string; etapa: string; posicao: number; dias: number[] }>();
  for (const e of etapas) {
    const chave = `${e.tipoNome}|${e.posicao}|${e.etapa}`;
    const l = por.get(chave) ?? { tipoNome: e.tipoNome, etapa: e.etapa, posicao: e.posicao, dias: [] };
    l.dias.push(e.diasUteis);
    por.set(chave, l);
  }
  const volumeDoTipo = new Map<string, number>();
  for (const e of etapas) volumeDoTipo.set(e.tipoNome, (volumeDoTipo.get(e.tipoNome) ?? 0) + 1);
  return [...por.entries()]
    .map(([chave, l]) => ({
      chave,
      tipoNome: l.tipoNome,
      etapa: l.etapa,
      posicao: l.posicao,
      concluidas: l.dias.length,
      medianaDias: Math.round(mediana(l.dias) * 10) / 10,
      maximoDias: Math.max(...l.dias),
    }))
    .sort(
      (a, b) =>
        (volumeDoTipo.get(b.tipoNome) ?? 0) - (volumeDoTipo.get(a.tipoNome) ?? 0) ||
        a.tipoNome.localeCompare(b.tipoNome, "pt-BR") ||
        a.posicao - b.posicao
    );
}

/** A frase de leitura: a etapa que mais demora, com pelo menos 3 concluídas. */
export function leituraDoTempoPorEtapa(linhas: LinhaDoTempoPorEtapa[]): string {
  if (linhas.length === 0) return "Nenhuma etapa concluída no período com início registrado.";
  const comAmostra = linhas.filter((l) => l.concluidas >= 3);
  const base = comAmostra.length ? comAmostra : linhas;
  const pior = [...base].sort((a, b) => b.medianaDias - a.medianaDias)[0];
  const dias = (n: number) => `${String(n).replace(".", ",")} ${n === 1 ? "dia útil" : "dias úteis"}`;
  return `A etapa que mais demora é “${pior.etapa}”, em ${pior.tipoNome}: ${dias(pior.medianaDias)} em mediana (${pior.concluidas} ${pior.concluidas === 1 ? "concluída" : "concluídas"}, a mais longa com ${dias(pior.maximoDias)}).`;
}
