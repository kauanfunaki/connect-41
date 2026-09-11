// Abrir e encerrar uma chamada de IA.
//
// É o irmão de `src/lib/integracoes/execucao.ts`, e pelo mesmo motivo: existe
// **um caminho só** para terminar uma chamada. Lá a lição custou três dias de
// `lastError` mentindo sobre vinte e cinco raízes saudáveis do SPED; aqui o que
// está em jogo é dinheiro, e uma chamada que termina por fora não entra na
// conta do mês.
//
// ─── As duas portas antes de gastar ─────────────────────────────────────────
//
// `podeChamar` roda **antes** da chamada, e é onde o teto acontece. Depois não
// adianta: o token já foi cobrado.
//
// São dois tetos porque um deles não funciona sozinho. O teto em reais depende
// da tabela de preço, e modelo novo ou override de cliente cai fora dela. O
// teto de chamadas não depende de nada — conta linha. Quando o preço é
// conhecido, os dois valem; quando não é, o de chamadas é o que resta de pé.

import type { GastoDoMes, UsoDeTokens } from "@/lib/ia/custo";

export type DesfechoDaChamada =
  /**
   * `uso` nulo é sucesso sem contagem de tokens — acontece quando o provedor
   * responde sem o bloco de uso. Não é zero: zero seria uma chamada de graça, e
   * somar zeros ao mês é como o teto deixa de proteger sem ninguém notar.
   */
  | { ok: true; uso: UsoDeTokens | null; custoCentavos: number | null }
  | { ok: false; erro: string };

export type GravacaoDoFim = {
  finishedAt: Date;
  ok: boolean;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
};

const LIMITE_DO_ERRO = 500;

/**
 * O que gravar quando uma chamada termina.
 *
 * Função pura, separada da escrita, e é o único caminho que fecha uma
 * `AgentRun`. Vale para os dois lados: uma chamada que falhou **depois** de o
 * provedor contar os tokens também custou dinheiro, e some da conta se o
 * caminho de falha não gravar custo.
 */
export function finalizarChamada(desfecho: DesfechoDaChamada, agora: Date): GravacaoDoFim {
  if (desfecho.ok) {
    return {
      finishedAt: agora,
      ok: true,
      error: null,
      inputTokens: desfecho.uso?.entrada ?? null,
      outputTokens: desfecho.uso?.saida ?? null,
      costCents: desfecho.custoCentavos,
    };
  }

  return {
    finishedAt: agora,
    ok: false,
    error: (desfecho.erro || "falha desconhecida").slice(0, LIMITE_DO_ERRO),
    // Falha sem uso apurado: tokens nulos, e custo nulo — que aqui significa
    // "não sabemos", não "zero". Quem souber grava pelo caminho de sucesso.
    inputTokens: null,
    outputTokens: null,
    costCents: null,
  };
}

export type EstadoParaChamar = {
  /** O agente está ligado para este cliente (catálogo ou override). */
  ligado: boolean;
  /** Existe chave de IA — de tenant ou do ambiente. */
  temChave: boolean;
  gasto: GastoDoMes;
  tetoMensalCentavos: number;
  tetoMensalChamadas: number;
};

export type MotivoDeRecusa =
  | "desligado"
  | "sem_chave"
  | "teto_de_reais"
  | "teto_de_chamadas";

export type VereditoDeChamada =
  | { pode: true }
  | { pode: false; motivo: MotivoDeRecusa; texto: string };

/** O texto que a tela mostra. Fica junto do motivo para não divergirem. */
const TEXTO: Record<MotivoDeRecusa, string> = {
  desligado: "Este agente está desligado para esta empresa.",
  sem_chave: "Nenhuma chave de IA configurada. Configure em Integrações › Inteligência Artificial.",
  teto_de_reais: "O teto de gasto de IA deste mês foi atingido.",
  teto_de_chamadas: "O teto de chamadas de IA deste mês foi atingido.",
};

/**
 * Vale fazer esta chamada agora?
 *
 * A ordem das recusas é a ordem em que elas são verdade: desligado e sem chave
 * são estado, não consumo, e responder "teto atingido" a quem nunca configurou
 * chave manda a pessoa procurar no lugar errado.
 *
 * O teto é `>=`, não `>`: atingir o teto é o momento de parar, não o momento de
 * fazer mais uma.
 */
export function podeChamar(estado: EstadoParaChamar): VereditoDeChamada {
  if (!estado.ligado) return { pode: false, motivo: "desligado", texto: TEXTO.desligado };
  if (!estado.temChave) return { pode: false, motivo: "sem_chave", texto: TEXTO.sem_chave };

  if (estado.gasto.chamadas >= estado.tetoMensalChamadas) {
    return { pode: false, motivo: "teto_de_chamadas", texto: TEXTO.teto_de_chamadas };
  }
  if (estado.gasto.centavos >= estado.tetoMensalCentavos) {
    return { pode: false, motivo: "teto_de_reais", texto: TEXTO.teto_de_reais };
  }
  return { pode: true };
}

export type SaudeDoAgente =
  | "desligado"
  | "sem_chave"
  | "nunca_usado"
  | "ok"
  | "custo_desconhecido"
  | "perto_do_teto"
  | "no_teto";

/**
 * Como o agente está, para a tela dizer em uma palavra.
 *
 * `custo_desconhecido` é o estado que só existe porque alguém precisa notá-lo:
 * o agente roda, não dá erro, e o total do mês não significa nada porque parte
 * das chamadas usou modelo fora da tabela de preço. Sem esse estado, a tela
 * mostraria um número tranquilo e errado — que é a mesma classe de defeito do
 * `lastError` fantasma, trocando estado de erro por estado de conta.
 */
export function saudeDoAgente(
  estado: EstadoParaChamar,
  avisarApartirDe = 0.8
): SaudeDoAgente {
  if (!estado.ligado) return "desligado";
  if (!estado.temChave) return "sem_chave";
  if (estado.gasto.chamadas === 0) return "nunca_usado";

  const veredito = podeChamar(estado);
  if (!veredito.pode) return "no_teto";

  if (estado.gasto.semCusto > 0) return "custo_desconhecido";

  const fracaoReais = estado.gasto.centavos / estado.tetoMensalCentavos;
  const fracaoChamadas = estado.gasto.chamadas / estado.tetoMensalChamadas;
  if (Math.max(fracaoReais, fracaoChamadas) >= avisarApartirDe) return "perto_do_teto";

  return "ok";
}

/**
 * O primeiro instante do mês corrente em São Paulo, como Date UTC.
 *
 * O mês do teto é o mês do calendário de quem olha a tela, não o do servidor —
 * e nas primeiras horas de todo dia 1º os dois discordam. Um teto que vira três
 * horas antes da virada é um teto que solta e trava na hora errada.
 */
export function inicioDoMesEmSaoPaulo(agora: Date): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(agora);
  const ano = Number(partes.find((p) => p.type === "year")!.value);
  const mes = Number(partes.find((p) => p.type === "month")!.value);
  // São Paulo é UTC-3 o ano todo desde 2019 (sem horário de verão).
  return new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
}
