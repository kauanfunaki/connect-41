// Pontuação do teste DISC (forced-choice). Cada bloco tem 1 palavra por
// dimensão; o respondente marca "mais como eu" e "menos como eu" (índices
// diferentes) por bloco. net[dim] = quantas vezes foi "mais" menos quantas
// vezes foi "menos" (-24..+24), normalizado pra 0-100 pra exibição em barra.

import { DISC_BANK, TOTAL_BLOCKS, type DiscDimension } from "./discBank";

export type { DiscDimension };

export const DISC_LABEL: Record<DiscDimension, string> = {
  D: "Dominância",
  I: "Influência",
  S: "Estabilidade",
  C: "Conformidade",
};

// Ordem de prioridade pra desempate — arbitrária, não é uma afirmação de
// pontuação, só garante um primaryProfile determinístico.
export const DISC_DIMENSIONS: DiscDimension[] = ["D", "I", "S", "C"];

// secondaryProfile só é reportado se a diferença pro primeiro colocado for
// pequena o bastante pra indicar um perfil combinado, não um só dominante.
export const PROFILE_MARGIN = 3;

export type DiscAnswer = { block: number; maisIndex: number; menosIndex: number };

export type DiscDimensionScore = { mais: number; menos: number; net: number; pct: number };

export type DiscScores = Record<DiscDimension, DiscDimensionScore>;

export type DiscResult = {
  scores: DiscScores;
  primaryProfile: DiscDimension;
  secondaryProfile: DiscDimension | null;
};

function isDiscAnswerShape(v: unknown): v is DiscAnswer {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).block === "number" &&
    typeof (v as Record<string, unknown>).maisIndex === "number" &&
    typeof (v as Record<string, unknown>).menosIndex === "number"
  );
}

// Valida a resposta bruta recebida do público: precisa ter exatamente os 24
// blocos (um por índice, sem repetir e sem faltar), e mais !== menos em cada.
export function validateDiscAnswers(raw: unknown): DiscAnswer[] | null {
  if (!Array.isArray(raw) || raw.length !== TOTAL_BLOCKS) return null;

  const seen = new Set<number>();
  const answers: DiscAnswer[] = [];

  for (const item of raw) {
    if (!isDiscAnswerShape(item)) return null;
    const { block, maisIndex, menosIndex } = item;
    if (!Number.isInteger(block) || block < 0 || block >= TOTAL_BLOCKS) return null;
    if (seen.has(block)) return null;
    if (!Number.isInteger(maisIndex) || maisIndex < 0 || maisIndex > 3) return null;
    if (!Number.isInteger(menosIndex) || menosIndex < 0 || menosIndex > 3) return null;
    if (maisIndex === menosIndex) return null;
    seen.add(block);
    answers.push({ block, maisIndex, menosIndex });
  }

  return seen.size === TOTAL_BLOCKS ? answers : null;
}

export function scoreDisc(answers: DiscAnswer[]): DiscResult {
  const maisCount: Record<DiscDimension, number> = { D: 0, I: 0, S: 0, C: 0 };
  const menosCount: Record<DiscDimension, number> = { D: 0, I: 0, S: 0, C: 0 };

  for (const answer of answers) {
    const block = DISC_BANK[answer.block]!;
    maisCount[block[answer.maisIndex]!.dim]++;
    menosCount[block[answer.menosIndex]!.dim]++;
  }

  const scores = {} as DiscScores;
  for (const dim of DISC_DIMENSIONS) {
    const net = maisCount[dim] - menosCount[dim];
    scores[dim] = {
      mais: maisCount[dim],
      menos: menosCount[dim],
      net,
      pct: Math.round(((net + TOTAL_BLOCKS) / (TOTAL_BLOCKS * 2)) * 100),
    };
  }

  const ranked = [...DISC_DIMENSIONS].sort((a, b) => {
    if (scores[b]!.net !== scores[a]!.net) return scores[b]!.net - scores[a]!.net;
    return DISC_DIMENSIONS.indexOf(a) - DISC_DIMENSIONS.indexOf(b);
  });

  const primaryProfile = ranked[0]!;
  const secondDim = ranked[1]!;
  const gap = scores[primaryProfile]!.net - scores[secondDim]!.net;
  const secondaryProfile = gap <= PROFILE_MARGIN ? secondDim : null;

  return { scores, primaryProfile, secondaryProfile };
}
