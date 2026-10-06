// Os números que a Home destaca (06/10): cada um com um nome fixo, que é a
// identidade dele na faixa de destaques e, na opção A, a chave do histórico.
// Renomear uma chave daqui é perder o histórico dela — trate como coluna.

export type FormatoDaMetrica = "moeda" | "contagem";

type DefinicaoDaMetrica = {
  /** Moeda em centavos; contagem em unidades. */
  formato: FormatoDaMetrica;
};

export const METRICAS = {
  // Tarefas (painel "Tarefas por prazo")
  tarefas_atrasadas: { formato: "contagem" },
  tarefas_hoje: { formato: "contagem" },
  // BPO — contas
  pagar_vencido: { formato: "moeda" },
  receber_vencido: { formato: "moeda" },
  pagar_aberto: { formato: "moeda" },
  receber_aberto: { formato: "moeda" },
  // BPO — semanas
  pagar_seis_semanas: { formato: "moeda" },
  pagar_esta_semana: { formato: "moeda" },
  // BPO — pendências e aprovações
  pendencias_vencidas: { formato: "contagem" },
  pendencias_abertas: { formato: "contagem" },
  aprovacoes_aguardando: { formato: "contagem" },
  // Societário
  processos_estourados: { formato: "contagem" },
  processos_abertos: { formato: "contagem" },
  // DP
  ferias_vencidas: { formato: "contagem" },
  ferias_a_vencer: { formato: "contagem" },
  // Recrutamento
  vagas_abertas: { formato: "contagem" },
  // Certificados
  certificados_vencidos: { formato: "contagem" },
  certificados_a_renovar: { formato: "contagem" },
} as const satisfies Record<string, DefinicaoDaMetrica>;

export type MetricaDaHome = keyof typeof METRICAS;
