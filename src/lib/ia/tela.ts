// O que a tela de agentes precisa saber, sem tocar no banco.
//
// Separado de `data.ts` pelo motivo de sempre: a regra que decide se um agente
// aparece em vermelho é a que precisa de teste, e testá-la não deveria custar
// um banco. `data.ts` busca; aqui se decide o que aquilo significa.

import type { SaudeDoAgente } from "@/lib/ia/execucao";
import type { GastoDoMes } from "@/lib/ia/custo";

export type VarianteDeBadge = "success" | "warning" | "danger" | "info";

export const SAUDE_LABEL: Record<SaudeDoAgente, string> = {
  desligado: "Desligado",
  sem_chave: "Sem chave",
  nunca_usado: "Nunca usado",
  ok: "Em dia",
  custo_desconhecido: "Custo não apurado",
  perto_do_teto: "Perto do teto",
  no_teto: "No teto",
};

/**
 * A cor de cada estado.
 *
 * `custo_desconhecido` é **warning, não info**. É a decisão da tela: um total
 * que não significa nada precisa parecer um problema, senão quem olha lê o
 * número tranquilo e segue em frente — que é exatamente o que aconteceu com o
 * `lastError` fantasma do SPED, em outra roupa.
 */
export const SAUDE_VARIANTE: Record<SaudeDoAgente, VarianteDeBadge> = {
  desligado: "info",
  sem_chave: "warning",
  nunca_usado: "info",
  ok: "success",
  custo_desconhecido: "warning",
  perto_do_teto: "warning",
  no_teto: "danger",
};

/**
 * A explicação do estado, em uma frase, dita para quem administra.
 *
 * Existe porque badge sozinho não diz o que fazer: "No teto" informa, "não vai
 * rodar até virar o mês ou o teto subir" resolve.
 */
export const SAUDE_EXPLICACAO: Record<SaudeDoAgente, string> = {
  desligado: "Não roda. Ligue abaixo para voltar a usar.",
  sem_chave: "Nenhuma chave de IA cadastrada — nenhum agente roda sem ela.",
  nunca_usado: "Nenhuma chamada neste mês.",
  ok: "Rodando dentro dos tetos.",
  custo_desconhecido:
    "Parte das chamadas usou modelo fora da tabela de preço — o total abaixo está incompleto. Quem segura neste caso é o teto de chamadas.",
  perto_do_teto: "Passou de 80% de um dos tetos deste mês.",
  no_teto: "Não vai rodar até virar o mês ou alguém subir o teto.",
};

/**
 * Quanto do teto já foi, de 0 a 1.
 *
 * Devolve a **maior** das duas frações, porque é a que trava primeiro — mostrar
 * a média daria uma barra tranquila num agente prestes a parar.
 *
 * Teto zero é "não gaste nada", e conta como cheio: dividir por zero daria
 * `Infinity`, e `0/0` daria `NaN`, que vira barra em branco na tela.
 */
export function fracaoDoTeto(
  gasto: GastoDoMes,
  tetoMensalCentavos: number,
  tetoMensalChamadas: number
): number {
  const reais = tetoMensalCentavos <= 0 ? 1 : gasto.centavos / tetoMensalCentavos;
  const chamadas = tetoMensalChamadas <= 0 ? 1 : gasto.chamadas / tetoMensalChamadas;
  return Math.min(1, Math.max(0, Math.max(reais, chamadas)));
}

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function moeda(centavos: number): string {
  return MOEDA.format(centavos / 100);
}

/**
 * O gasto do mês em uma linha.
 *
 * Quando há chamada sem custo apurado, o texto **diz isso junto do número** em
 * vez de deixar o total falar sozinho. "R$ 3,50" e "R$ 3,50 + 12 sem custo
 * apurado" são afirmações diferentes, e só a segunda é verdadeira.
 */
export function resumoDoGasto(gasto: GastoDoMes): string {
  if (gasto.chamadas === 0) return "nenhuma chamada";
  const chamadas = gasto.chamadas === 1 ? "1 chamada" : `${gasto.chamadas} chamadas`;
  if (gasto.semCusto === 0) return `${moeda(gasto.centavos)} · ${chamadas}`;
  return `${moeda(gasto.centavos)} + ${gasto.semCusto} sem custo apurado · ${chamadas}`;
}

/** O rótulo de quem disparou, para a lista de chamadas. */
export const TRIGGER_LABEL: Record<string, string> = {
  USUARIO: "Alguém pediu",
  CRON: "Rotina",
  SISTEMA: "Sistema",
};

/**
 * O desfecho de uma chamada, para a lista.
 *
 * Três estados, não dois: uma linha aberta há muito tempo é uma chamada que
 * morreu no meio, e chamá-la de "falhou" esconderia que ninguém a encerrou —
 * que é justamente o sinal de que algo derrubou o processo.
 */
export type DesfechoNaLista = "ok" | "erro" | "em_andamento" | "abandonada";

const ABANDONO_EM_MINUTOS = 15;

export function desfechoDaChamada(
  linha: { ok: boolean | null; finishedAt: Date | null; startedAt: Date },
  agora: Date
): DesfechoNaLista {
  if (linha.ok === true) return "ok";
  if (linha.ok === false) return "erro";
  const minutos = (agora.getTime() - linha.startedAt.getTime()) / 60_000;
  return minutos > ABANDONO_EM_MINUTOS ? "abandonada" : "em_andamento";
}

export const DESFECHO_LABEL: Record<DesfechoNaLista, string> = {
  ok: "OK",
  erro: "Falhou",
  em_andamento: "Rodando",
  abandonada: "Sem desfecho",
};

export const DESFECHO_VARIANTE: Record<DesfechoNaLista, VarianteDeBadge> = {
  ok: "success",
  erro: "danger",
  em_andamento: "info",
  abandonada: "warning",
};
