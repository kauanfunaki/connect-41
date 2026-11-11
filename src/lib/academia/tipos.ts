// Os formatos que o servidor da Academia entrega às telas (10/11/2026). Só
// tipos, sem banco: os componentes de cliente importam daqui, nunca de
// `servidor.ts` (que puxa o Prisma e quebraria o `next build`).

import type { Alternativa } from "./logica";
import type { CorrecaoDoPedido, OndeDoAtalho } from "./atalhos";
import type { LinhaDaEvolucao, LinhaDoPlacar } from "./evolucao";
import type { CategoriaDoHall } from "./hall";
import type { ProgressoDaMeta } from "./metas";
import type { PosicaoNoRanking } from "./ranking";
import type { Nivel, Teste } from "./regras";
import type { Sequencia } from "./sequencia";

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

/** A meta pessoal na tela (Fase 2): o que a pessoa quer, até quando, e o quanto já chegou. */
export type MetaNaTela = {
  teste: Teste;
  nivel: Nivel | null;
  alvo: number;
  prazo: string;
  /** "60 PPM em Digitação, nível Médio". */
  texto: string;
  progresso: ProgressoDaMeta;
};

/** O desafio do dia de quem olha (Fase 2). */
export type DesafioDeHoje = {
  /** Há texto no banco para o desafio de hoje? */
  disponivel: boolean;
  feitoHoje: boolean;
  /** A tentativa de hoje já foi gasta (começou), feita ou não. */
  usadoHoje: boolean;
  /** O resultado de hoje, quando feito. */
  resultado: { ppm: number; precisao: number } | null;
  sequencia: Sequencia;
};

export type ResumoDaAcademia = {
  mes: string;
  aparece: boolean;
  premio: string | null;
  /** O prêmio da maior evolução do mês (Fase 2). */
  premioDaEvolucao: string | null;
  testes: Record<Teste, ResumoDoTeste>;
  /** A melhor colocação entre os testes ("Posição em novembro"). */
  melhorPosicao: { teste: Teste; posicao: number; participantes: number } | null;
  /** Há o que servir em cada nível (textos e questões ativos)? Números e atalhos sempre. */
  disponivel: Record<Teste, Record<Nivel, boolean>>;
  desafio: DesafioDeHoje;
  meta: MetaNaTela | null;
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
      /** O desafio do dia (Fase 2): digitação, com o texto do dia. */
      desafio?: boolean;
    }
  | {
      teste: "logica";
      sessaoId: string;
      nonce: string;
      nivel: Nivel;
      valendo: boolean;
      questoes: { id: string; enunciado: string; imagemUrl: string | null; alternativas: Alternativa[] }[];
      expiraEm: string;
    }
  | {
      /** Atalhos (Fase 2): os pedidos, sem as teclas — a correção é do servidor. */
      teste: "atalhos";
      sessaoId: string;
      nonce: string;
      nivel: Nivel;
      valendo: boolean;
      pedidos: { id: string; acao: string; onde: OndeDoAtalho }[];
      expiraEm: string;
    };

export type ResultadoDoEnvio =
  | {
      ok: true;
      teste: Teste;
      nivel: Nivel;
      valendo: boolean;
      ppm: number | null;
      acertos: number | null;
      total: number | null;
      precisao: number;
      duracaoMs: number;
      /** Atalhos: cada pedido respondido, com o certo. */
      correcao?: CorrecaoDoPedido[];
      /** O desafio do dia: a sequência depois dele. */
      desafio?: { sequencia: Sequencia };
    }
  | { ok: false; erro: string };

// ─── Fase 2 (11/11/2026): evolução, placar, Hall e parabéns ──────────────────

type ComNome = { nome: string; fotoUrl: string | null; setor: string | null; eu: boolean };
export type LinhaDaEvolucaoNaTela = LinhaDaEvolucao & ComNome;

export type EvolucaoNaTela = {
  teste: Teste;
  mes: string;
  foraDoRanking: boolean;
  topo: LinhaDaEvolucaoNaTela[];
  eu: LinhaDaEvolucaoNaTela | null;
  participantes: number;
  /** A evolução de quem olha, mesmo sem ter melhorado (ou fora do ranking). */
  minha: Omit<LinhaDaEvolucao, "posicao"> | null;
};

export type PlacarNaTela = {
  teste: Teste;
  mes: string;
  foraDoRanking: boolean;
  linhas: (LinhaDoPlacar & { setor: string; meu: boolean })[];
  /** Setores com resultado no mês que ficaram de fora por ter menos pessoas que o mínimo. */
  setoresDeFora: number;
};

export type CampeaoNaTela = {
  categoria: CategoriaDoHall;
  posicao: number;
  userId: string;
  nome: string;
  fotoUrl: string | null;
  teste: Teste;
  valor: string;
  premio: string | null;
  eu: boolean;
};
export type MesDoHall = { mes: string; campeoes: CampeaoNaTela[] };

/**
 * Os "Parabéns" que quem olha já mandou num mês, por tipo (o teste ou
 * "evolucao"): a lista dos ids de quem recebeu. `podeMandar` falso esconde o
 * botão (somente leitura, fora do ranking, visitando outro escritório).
 */
export type ParabensDeQuemOlha = { podeMandar: boolean; enviados: Record<string, string[]> };

export type TextoNaTela ={ id: string; nivel: Nivel; conteudo: string; ativo: boolean; doHub: boolean; criadoEm: string };
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
