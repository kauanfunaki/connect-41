// Consolidação de scorecards de entrevista. Critérios fixos (1-5); a média de
// um scorecard ignora critérios não preenchidos, e o consolidado da candidatura
// é a média das médias + o tally de recomendações dos entrevistadores.

export const CRITERIA = [
  { key: "comunicacao", label: "Comunicação" },
  { key: "tecnico", label: "Conhecimento técnico" },
  { key: "fitCultural", label: "Fit cultural" },
  { key: "experiencia", label: "Experiência" },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

export const RECOMMENDATION_LABEL: Record<string, string> = {
  AVANCAR: "Avançar",
  TALVEZ: "Talvez",
  REPROVAR: "Reprovar",
};

export type ScoreLike = {
  comunicacao: number | null;
  tecnico: number | null;
  fitCultural: number | null;
  experiencia: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Média dos critérios preenchidos de um scorecard; null se nenhum foi pontuado.
export function scorecardAverage(sc: ScoreLike): number | null {
  const vals = [sc.comunicacao, sc.tecnico, sc.fitCultural, sc.experiencia].filter(
    (v): v is number => v != null
  );
  if (vals.length === 0) return null;
  return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export type ScorecardConsolidation = {
  count: number;
  averageScore: number | null;
  tally: { AVANCAR: number; TALVEZ: number; REPROVAR: number };
};

export function consolidateScorecards(
  list: (ScoreLike & { recommendation: string })[]
): ScorecardConsolidation {
  const avgs = list.map(scorecardAverage).filter((v): v is number => v != null);
  const averageScore = avgs.length ? round1(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;

  const tally = { AVANCAR: 0, TALVEZ: 0, REPROVAR: 0 };
  for (const s of list) {
    if (s.recommendation in tally) tally[s.recommendation as keyof typeof tally]++;
  }

  return { count: list.length, averageScore, tally };
}
