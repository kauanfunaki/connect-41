// Os formatos que o servidor da Academia entrega às telas (10/11/2026). Só
// tipos, sem banco: os componentes de cliente importam daqui, nunca de
// `servidor.ts` (que puxa o Prisma e quebraria o `next build`).

import type { Alternativa } from "./logica";
import type { PosicaoNoRanking } from "./ranking";
import type { Nivel, Teste } from "./regras";

/** Uma linha do ranking na tela: a posição com o nome e o setor. */
export type LinhaDaTela = PosicaoNoRanking & { nome: string; fotoUrl: string | null; setor: string | null; eu: boolean };

export type RankingNaTela = {
  teste: Teste;
  mes: string;
  nivel: Nivel | null;
  setor: string | null;
  /** A pessoa desligou "Aparecer no ranking": vê só os próprios números. */
  foraDoRanking: boolean;
  topo: LinhaDaTela[];
  /** A linha de quem olha, quando está abaixo do topo. */
  eu: LinhaDaTela | null;
  participantes: number;
  /** Os números de quem olha neste recorte — também para quem está fora do ranking. */
  meusNumeros: PosicaoNoRanking | null;
};

export type MelhorDoMes = { nivel: Nivel; ppm: number | null; acertos: number | null; total: number | null; precisao: number };

export type ResumoDoTeste = {
  teste: Teste;
  melhor: MelhorDoMes | null;
  /** Posição no ranking geral do mês (todos os níveis), ou nulo. */
  posicao: number | null;
  participantes: number;
  /** Os níveis em que a tentativa valendo de hoje já foi usada. */
  usadosHoje: Nivel[];
  /** O topo do ranking geral (só no Início), e a linha de quem olha abaixo dele. */
  topo: LinhaDaTela[];
  eu: LinhaDaTela | null;
};

export type ResumoDaAcademia = {
  mes: string;
  aparece: boolean;
  premio: string | null;
  testes: Record<Teste, ResumoDoTeste>;
  /** A melhor colocação entre os três testes ("Posição em novembro"). */
  melhorPosicao: { teste: Teste; posicao: number; participantes: number } | null;
  /** Há o que servir em cada nível (textos e questões ativos)? Números sempre. */
  disponivel: Record<Teste, Record<Nivel, boolean>>;
};

export type RodadaServida =
  | {
      teste: "digitacao" | "numeros";
      sessaoId: string;
      nonce: string;
      nivel: Nivel;
      valendo: boolean;
      texto: string;
      expiraEm: string;
    }
  | {
      teste: "logica";
      sessaoId: string;
      nonce: string;
      nivel: Nivel;
      valendo: boolean;
      questoes: { id: string; enunciado: string; imagemUrl: string | null; alternativas: Alternativa[] }[];
      expiraEm: string;
    };

export type ResultadoDoEnvio =
  | { ok: true; teste: Teste; nivel: Nivel; valendo: boolean; ppm: number | null; acertos: number | null; total: number | null; precisao: number; duracaoMs: number }
  | { ok: false; erro: string };

export type TextoNaTela = { id: string; nivel: Nivel; conteudo: string; ativo: boolean; doHub: boolean; criadoEm: string };
export type QuestaoNaTela = {
  id: string;
  nivel: Nivel;
  enunciado: string;
  imagemUrl: string | null;
  alternativas: Alternativa[];
  correta: number;
  ativo: boolean;
  doHub: boolean;
};
