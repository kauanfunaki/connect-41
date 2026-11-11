// O ranking do mês (10/11/2026, pedido do Kauan), na régua do 41 Hub
// (server/storage.ts, getTypingLeaderboard e getLogicLeaderboard). Puro: o
// servidor lê os resultados valendo de UM mês e de UM teste e passa para cá.
//
// Digitação e números
//   - Num nível: o melhor resultado de cada pessoa pelo PPM líquido (PPM ×
//     precisão), e a ordem é por ele; empate, a maior precisão.
//   - Todos os níveis: o melhor de cada nível, numa média ponderada pelo nível
//     (fácil 1,0 · médio 1,4 · difícil 1,8) do PPM e da precisão; a ordem é
//     pela média do PPM, e o nível mostrado é o mais difícil que a pessoa fez.
// Lógica
//   - Num nível: o melhor de cada pessoa pela precisão (empate, o menor
//     tempo); a ordem é pela precisão, depois menos tentativas no mês, depois
//     o menor tempo.
//   - Todos os níveis: soma ponderada (fácil 1 · médio 2 · difícil 3) da
//     precisão do melhor de cada nível — tentar o nível mais difícil sempre
//     soma, nunca dilui; depois menos tentativas, depois o menor tempo médio.
//
// Quem desligou "Aparecer no ranking" sai antes da conta: as posições dos
// outros ficam seguidas, sem buraco.

import { NIVEIS, type Nivel, type Teste } from "./regras";

export type LinhaDoResultado = {
  userId: string;
  nivel: Nivel;
  sectorCode: string | null;
  ppm: number | null;
  acertos: number | null;
  total: number | null;
  precisao: number;
  duracaoMs: number;
};

export type PosicaoNoRanking = {
  posicao: number;
  userId: string;
  /** O nível do resultado mostrado (em "Todos os níveis", o mais difícil que a pessoa fez). */
  nivel: Nivel;
  niveis: Nivel[];
  sectorCode: string | null;
  /** Digitação e números: o PPM mostrado (em "Todos", a média ponderada). */
  ppm: number | null;
  /** Lógica: acertos e total (em "Todos", somados nos níveis). */
  acertos: number | null;
  total: number | null;
  /** Precisão mostrada, em %. */
  precisao: number;
  /** O número que ordena: PPM líquido, PPM médio, precisão ou a soma ponderada. */
  pontos: number;
  tentativas: number;
  duracaoMs: number;
};

const PESO_DA_DIGITACAO: Record<Nivel, number> = { facil: 1.0, medio: 1.4, dificil: 1.8 };
const PESO_DA_LOGICA: Record<Nivel, number> = { facil: 1, medio: 2, dificil: 3 };
const ORDEM_DO_NIVEL: Record<Nivel, number> = { facil: 0, medio: 1, dificil: 2 };

const ppmLiquido = (l: LinhaDoResultado) => ((l.ppm ?? 0) * l.precisao) / 100;
const duas = (n: number) => Math.round(n * 100) / 100;

function melhorDaDigitacao(a: LinhaDoResultado, b: LinhaDoResultado): boolean {
  return ppmLiquido(a) > ppmLiquido(b) || (ppmLiquido(a) === ppmLiquido(b) && a.precisao > b.precisao);
}
function melhorDaLogica(a: LinhaDoResultado, b: LinhaDoResultado): boolean {
  return a.precisao > b.precisao || (a.precisao === b.precisao && a.duracaoMs < b.duracaoMs);
}

type PorPessoa = { tentativas: number; porNivel: Map<Nivel, LinhaDoResultado> };

function agrupar(linhas: readonly LinhaDoResultado[], melhor: (a: LinhaDoResultado, b: LinhaDoResultado) => boolean): Map<string, PorPessoa> {
  const mapa = new Map<string, PorPessoa>();
  for (const l of linhas) {
    let p = mapa.get(l.userId);
    if (!p) mapa.set(l.userId, (p = { tentativas: 0, porNivel: new Map() }));
    p.tentativas++;
    const atual = p.porNivel.get(l.nivel);
    if (!atual || melhor(l, atual)) p.porNivel.set(l.nivel, l);
  }
  return mapa;
}

const porDificuldade = (a: LinhaDoResultado, b: LinhaDoResultado) => ORDEM_DO_NIVEL[a.nivel] - ORDEM_DO_NIVEL[b.nivel];

/**
 * O ranking inteiro, com posição. `nivel` nulo é "Todos os níveis". As linhas
 * já vêm de um mês e de um teste (e do nível e do setor, quando filtrados).
 */
export function montarRanking(teste: Teste, linhas: readonly LinhaDoResultado[], nivel: Nivel | null): PosicaoNoRanking[] {
  const doNivel = nivel ? linhas.filter((l) => l.nivel === nivel) : linhas;
  const semPosicao: Omit<PosicaoNoRanking, "posicao">[] = [];

  if (teste !== "logica") {
    for (const [userId, p] of agrupar(doNivel, melhorDaDigitacao)) {
      const melhores = [...p.porNivel.values()].sort(porDificuldade);
      const maisDificil = melhores[melhores.length - 1];
      if (nivel) {
        const m = melhores[0];
        semPosicao.push({
          userId, nivel: m.nivel, niveis: [m.nivel], sectorCode: m.sectorCode, ppm: m.ppm, acertos: null, total: null,
          precisao: m.precisao, pontos: duas(ppmLiquido(m)), tentativas: p.tentativas, duracaoMs: m.duracaoMs,
        });
        continue;
      }
      let ppm = 0, precisao = 0, pesos = 0;
      for (const m of melhores) {
        const peso = PESO_DA_DIGITACAO[m.nivel];
        ppm += (m.ppm ?? 0) * peso;
        precisao += m.precisao * peso;
        pesos += peso;
      }
      semPosicao.push({
        userId, nivel: maisDificil.nivel, niveis: melhores.map((m) => m.nivel), sectorCode: maisDificil.sectorCode,
        ppm: Math.round(ppm / pesos), acertos: null, total: null, precisao: Math.round((precisao / pesos) * 10) / 10,
        pontos: duas(ppm / pesos), tentativas: p.tentativas, duracaoMs: maisDificil.duracaoMs,
      });
    }
    const ordem = (a: (typeof semPosicao)[number], b: (typeof semPosicao)[number]) => b.pontos - a.pontos || b.precisao - a.precisao || a.userId.localeCompare(b.userId);
    return semPosicao.sort(ordem).map((p, i) => ({ ...p, posicao: i + 1 }));
  }

  for (const [userId, p] of agrupar(doNivel, melhorDaLogica)) {
    const melhores = [...p.porNivel.values()].sort(porDificuldade);
    const maisDificil = melhores[melhores.length - 1];
    if (nivel) {
      const m = melhores[0];
      semPosicao.push({
        userId, nivel: m.nivel, niveis: [m.nivel], sectorCode: m.sectorCode, ppm: null, acertos: m.acertos, total: m.total,
        precisao: m.precisao, pontos: m.precisao, tentativas: p.tentativas, duracaoMs: m.duracaoMs,
      });
      continue;
    }
    let pontos = 0, acertos = 0, total = 0, duracao = 0;
    for (const m of melhores) {
      pontos += m.precisao * PESO_DA_LOGICA[m.nivel];
      acertos += m.acertos ?? 0;
      total += m.total ?? 0;
      duracao += m.duracaoMs;
    }
    semPosicao.push({
      userId, nivel: maisDificil.nivel, niveis: melhores.map((m) => m.nivel), sectorCode: maisDificil.sectorCode,
      ppm: null, acertos, total, precisao: total > 0 ? Math.round((acertos / total) * 1000) / 10 : 0,
      pontos: duas(pontos), tentativas: p.tentativas, duracaoMs: Math.round(duracao / melhores.length),
    });
  }
  const ordem = (a: (typeof semPosicao)[number], b: (typeof semPosicao)[number]) =>
    b.pontos - a.pontos || a.tentativas - b.tentativas || a.duracaoMs - b.duracaoMs || a.userId.localeCompare(b.userId);
  return semPosicao.sort(ordem).map((p, i) => ({ ...p, posicao: i + 1 }));
}

/** Tira quem não quer aparecer, antes da conta das posições. */
export function semQuemSaiu<T extends { userId: string }>(linhas: readonly T[], foraDoRanking: ReadonlySet<string>): T[] {
  return foraDoRanking.size ? linhas.filter((l) => !foraDoRanking.has(l.userId)) : [...linhas];
}

/**
 * O recorte que a tela mostra: os `n` primeiros e a linha de quem olha, quando
 * ela está abaixo deles — nunca o fim da lista (pedido do Kauan: ninguém vê
 * quem ficou por último).
 */
export function recorteDoRanking(ranking: readonly PosicaoNoRanking[], userId: string | null, n = 10): { topo: PosicaoNoRanking[]; eu: PosicaoNoRanking | null; participantes: number } {
  const topo = ranking.slice(0, n);
  const minha = userId ? ranking.find((p) => p.userId === userId) ?? null : null;
  return { topo, eu: minha && minha.posicao > n ? minha : null, participantes: ranking.length };
}

/** A posição de quem olha, ou nulo (sem resultado no mês, ou fora do ranking). */
export const posicaoDe = (ranking: readonly PosicaoNoRanking[], userId: string) => ranking.find((p) => p.userId === userId) ?? null;

/** O certificado de destaque: o pódio (1º a 3º) do ranking geral de um mês que já acabou. */
export const PODIO = 3;
export function temCertificado(ranking: readonly PosicaoNoRanking[], userId: string, mesAcabou: boolean): PosicaoNoRanking | null {
  if (!mesAcabou) return null;
  const p = posicaoDe(ranking, userId);
  return p && p.posicao <= PODIO ? p : null;
}

/**
 * O melhor resultado da pessoa no mês, num teste — o "melhor do mês" do painel
 * e dos cartões. Digitação e números pelo PPM líquido; lógica pela precisão.
 */
export function melhorDoMes(teste: Teste, linhas: readonly LinhaDoResultado[]): LinhaDoResultado | null {
  const melhor = teste === "logica" ? melhorDaLogica : melhorDaDigitacao;
  let m: LinhaDoResultado | null = null;
  for (const l of linhas) if (!m || melhor(l, m)) m = l;
  return m;
}

/** O resultado em uma linha de texto: "62 PPM · 96%" ou "8 de 10 · 80%". */
export function resultadoEmTexto(teste: Teste, r: { ppm: number | null; acertos: number | null; total: number | null; precisao: number }): string {
  const pct = `${formatarPrecisao(r.precisao)}%`;
  return teste === "logica" ? `${r.acertos ?? 0} de ${r.total ?? 0} · ${pct}` : `${r.ppm ?? 0} PPM · ${pct}`;
}
/** 96 → "96"; 96,5 → "96,5". */
export const formatarPrecisao = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

export { NIVEIS };
