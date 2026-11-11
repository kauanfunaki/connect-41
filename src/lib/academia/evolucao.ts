// O ranking de evolução e o placar por setor (Academia, Fase 2, 11/11/2026 —
// Controle interno funcionalidade-594, escolhas do Kauan em 10/11). Puro: o
// servidor monta o ranking geral de cada mês (`montarRanking`, todos os
// níveis) e passa para cá.
//
// O número de cada pessoa num mês é o do ranking geral: o PPM médio ponderado
// pelo nível (digitação e números), a precisão somada nos níveis (lógica) ou
// os acertos médios ponderados (atalhos) — `numeroDoMes`.
//
// Evolução: o número do mês contra a média dos números da pessoa nos 3 meses
// anteriores (só os meses em que ela fez o teste valendo, e pelo menos um),
// com pelo menos 3 tentativas valendo no mês. Entra no ranking só quem
// melhorou; a própria pessoa vê a sua, mesmo sem ter melhorado.
//
// Placar por setor: a média do número de cada pessoa do setor no mês, só nos
// setores com pelo menos `MINIMO_DE_PESSOAS_NO_PLACAR` pessoas.

import { mesAnterior, type Teste } from "./regras";
import type { PosicaoNoRanking } from "./ranking";

/** Tentativas valendo no mês, no teste, para entrar no ranking de evolução. */
export const MINIMO_DE_TENTATIVAS_NA_EVOLUCAO = 3;
/** Os meses anteriores da média da evolução. */
export const MESES_DA_MEDIA_DA_EVOLUCAO = 3;
/** Pessoas de um setor, no mês, para ele entrar no placar. */
export const MINIMO_DE_PESSOAS_NO_PLACAR = 3;

/** O número da pessoa no mês (ver o topo do arquivo). */
export function numeroDoMes(teste: Teste, p: Pick<PosicaoNoRanking, "pontos" | "precisao">): number {
  return teste === "logica" ? p.precisao : p.pontos;
}

/** "54 PPM", "78%" ou "23 acertos" — o número do placar e da evolução. */
export function numeroDoMesEmTexto(teste: Teste, n: number): string {
  if (teste === "logica") return `${formatar(n)}%`;
  if (teste === "atalhos") return `${formatar(n)} ${Math.round(n) === 1 ? "acerto" : "acertos"}`;
  return `${Math.round(n)} PPM`;
}
function formatar(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

/** Os `n` meses antes de `mes`, do mais recente para o mais antigo. */
export function mesesAntes(mes: string, n: number): string[] {
  const lista: string[] = [];
  let m = mes;
  for (let i = 0; i < n; i++) lista.push((m = mesAnterior(m)));
  return lista;
}

export type LinhaDaEvolucao = {
  posicao: number;
  userId: string;
  sectorCode: string | null;
  /** O número do mês. */
  atual: number;
  /** A média dos meses anteriores. */
  media: number;
  /** Quanto melhorou, em % sobre a média (uma casa). */
  evolucao: number;
  tentativas: number;
  /** Quantos dos meses anteriores entraram na média. */
  mesesNaMedia: number;
};

/**
 * A evolução de cada pessoa. `doMes` é o ranking geral do mês; `anteriores`, o
 * dos meses anteriores (qualquer ordem). Devolve `ranking` (só quem melhorou,
 * com posição) e `todas` (sem posição, para a pessoa ver a sua).
 */
export function montarEvolucao(
  teste: Teste,
  doMes: readonly PosicaoNoRanking[],
  anteriores: readonly (readonly PosicaoNoRanking[])[],
): { ranking: LinhaDaEvolucao[]; todas: Map<string, Omit<LinhaDaEvolucao, "posicao">> } {
  const historico = new Map<string, number[]>();
  for (const mes of anteriores) {
    for (const p of mes) {
      const lista = historico.get(p.userId) ?? [];
      lista.push(numeroDoMes(teste, p));
      historico.set(p.userId, lista);
    }
  }
  const todas = new Map<string, Omit<LinhaDaEvolucao, "posicao">>();
  for (const p of doMes) {
    const antes = historico.get(p.userId);
    if (!antes?.length || p.tentativas < MINIMO_DE_TENTATIVAS_NA_EVOLUCAO) continue;
    const media = antes.reduce((a, b) => a + b, 0) / antes.length;
    if (media <= 0) continue;
    const atual = numeroDoMes(teste, p);
    todas.set(p.userId, {
      userId: p.userId, sectorCode: p.sectorCode, atual, media: Math.round(media * 100) / 100,
      evolucao: Math.round(((atual - media) / media) * 1000) / 10, tentativas: p.tentativas, mesesNaMedia: antes.length,
    });
  }
  const ranking = [...todas.values()]
    .filter((l) => l.evolucao > 0)
    .sort((a, b) => b.evolucao - a.evolucao || b.atual - a.atual || a.userId.localeCompare(b.userId))
    .map((l, i) => ({ ...l, posicao: i + 1 }));
  return { ranking, todas };
}

/** "+18,5%" / "−4%". */
export function evolucaoEmTexto(n: number): string {
  const v = Math.abs(n);
  const t = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${t}%`;
}

export type LinhaDoPlacar = { posicao: number; sectorCode: string; media: number; pessoas: number };

/**
 * O placar do mês por setor: a média do número de cada pessoa (o setor dela é
 * o do resultado mostrado no ranking). Setor com menos de
 * `MINIMO_DE_PESSOAS_NO_PLACAR` pessoas fica de fora — e sem setor, também.
 */
export function placarPorSetor(teste: Teste, doMes: readonly PosicaoNoRanking[], minimo = MINIMO_DE_PESSOAS_NO_PLACAR): LinhaDoPlacar[] {
  const porSetor = new Map<string, number[]>();
  for (const p of doMes) {
    if (!p.sectorCode) continue;
    const lista = porSetor.get(p.sectorCode) ?? [];
    lista.push(numeroDoMes(teste, p));
    porSetor.set(p.sectorCode, lista);
  }
  return [...porSetor.entries()]
    .filter(([, ns]) => ns.length >= minimo)
    .map(([sectorCode, ns]) => ({ sectorCode, pessoas: ns.length, media: Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 100) / 100 }))
    .sort((a, b) => b.media - a.media || b.pessoas - a.pessoas || a.sectorCode.localeCompare(b.sectorCode))
    .map((l, i) => ({ ...l, posicao: i + 1 }));
}
