// Os números que a Home destaca (06/10): cada um com um nome fixo, que é a
// identidade dele na faixa de destaques e a chave do histórico (a foto diária
// em `home_metric_snapshots`). Renomear uma chave daqui é perder o histórico
// dela — trate como coluna.

export type FormatoDaMetrica = "moeda" | "contagem";

/**
 * Para que lado é melhor. Decide a cor do selo: subir em "contas vencidas" é
 * ruim (vermelho), subir em "recebido" seria bom (verde). Volume em aberto
 * ("vagas abertas", "processos em aberto") não é bom nem ruim por si — o selo
 * fica cinza.
 */
export type SentidoDaMetrica = "menor-e-melhor" | "maior-e-melhor" | "neutro";

/**
 * De quem é o número. "escritorio": o mesmo para todo mundo do tenant (uma
 * foto por dia serve a todos). "pessoal": depende de quem olha — as tarefas
 * dos kanbans que a pessoa enxerga, as vagas do escopo dela —, então a foto é
 * por usuário (e por setor ativo).
 */
export type EscopoDaMetrica = "escritorio" | "pessoal";

type DefinicaoDaMetrica = {
  /** Moeda em centavos; contagem em unidades. */
  formato: FormatoDaMetrica;
  sentido: SentidoDaMetrica;
  escopo: EscopoDaMetrica;
};

export const METRICAS = {
  // Tarefas (painel "Tarefas por prazo") — dos kanbans que a pessoa vê.
  tarefas_atrasadas: { formato: "contagem", sentido: "menor-e-melhor", escopo: "pessoal" },
  tarefas_hoje: { formato: "contagem", sentido: "neutro", escopo: "pessoal" },
  // BPO — contas (o escritório inteiro, como o painel)
  pagar_vencido: { formato: "moeda", sentido: "menor-e-melhor", escopo: "escritorio" },
  receber_vencido: { formato: "moeda", sentido: "menor-e-melhor", escopo: "escritorio" },
  pagar_aberto: { formato: "moeda", sentido: "neutro", escopo: "escritorio" },
  receber_aberto: { formato: "moeda", sentido: "neutro", escopo: "escritorio" },
  // BPO — semanas
  pagar_seis_semanas: { formato: "moeda", sentido: "neutro", escopo: "escritorio" },
  pagar_esta_semana: { formato: "moeda", sentido: "neutro", escopo: "escritorio" },
  // BPO — pendências e aprovações
  pendencias_vencidas: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  pendencias_abertas: { formato: "contagem", sentido: "neutro", escopo: "escritorio" },
  aprovacoes_aguardando: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  // Societário
  processos_estourados: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  processos_abertos: { formato: "contagem", sentido: "neutro", escopo: "escritorio" },
  // DP
  ferias_vencidas: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  ferias_a_vencer: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  // Recrutamento — o escopo de /vagas depende de quem olha (regra do recrutador).
  vagas_abertas: { formato: "contagem", sentido: "neutro", escopo: "pessoal" },
  // Certificados
  certificados_vencidos: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  certificados_a_renovar: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
} as const satisfies Record<string, DefinicaoDaMetrica>;

export type MetricaDaHome = keyof typeof METRICAS;

export const TODAS_AS_METRICAS = Object.keys(METRICAS) as MetricaDaHome[];

export function ehMetricaDaHome(chave: string): chave is MetricaDaHome {
  return Object.prototype.hasOwnProperty.call(METRICAS, chave);
}
