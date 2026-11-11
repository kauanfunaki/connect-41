// Os números que a Home acompanha (06/10): cada um com um nome fixo, que é a
// identidade dele nos painéis e nos cartões do topo (10/11/2026) e a chave do
// histórico (a foto diária em `home_metric_snapshots`, coluna de 40 letras).
// Renomear uma chave daqui é perder o histórico dela — trate como coluna.

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

  // ── Cartões coringa do topo (10/11/2026, pedido do Kauan) ──────────────────
  // Cada cartão do catálogo (`cartoes.ts`) é uma métrica daqui, com a mesma
  // chave: é o que dá a linha dos últimos dias e o "+2 desde ontem". Os que já
  // existiam acima (aprovações, processos estourados, férias, vagas) são
  // reaproveitados porque saem da mesma consulta que o painel usa —
  // a foto do cartão e a do painel são o mesmo número. Os que contam outra
  // coisa ganharam chave nova, mesmo com nome parecido (os certificados "para
  // renovar" do cartão somam os vencidos, como a aba "Renovar" da tela).
  // Os pessoais dependem de quem olha (o escopo do kanban, da caixa de
  // transferências, da fila de solicitações), como as tarefas do painel.
  tarefas_atrasadas_hoje: { formato: "contagem", sentido: "menor-e-melhor", escopo: "pessoal" },
  transferencias_setor: { formato: "contagem", sentido: "menor-e-melhor", escopo: "pessoal" },
  transferencias_enviadas: { formato: "contagem", sentido: "neutro", escopo: "pessoal" },
  solicitacoes_atrasadas: { formato: "contagem", sentido: "menor-e-melhor", escopo: "pessoal" },
  empresas_ativas: { formato: "contagem", sentido: "neutro", escopo: "escritorio" },
  chamados_que_abri: { formato: "contagem", sentido: "neutro", escopo: "pessoal" },
  // BPO
  contas_pagar_vencidas: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  contas_pagar_semana: { formato: "contagem", sentido: "neutro", escopo: "escritorio" },
  contas_receber_vencidas: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  // Todas as em aberto com o cliente, vencidas incluídas (a `pendencias_abertas`
  // do painel conta só as que ainda estão no prazo).
  pendencias_cliente: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  linhas_a_conciliar: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  // Fiscal e Contábil
  obrigacoes_risco_fiscal: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  obrigacoes_risco_contabil: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  guias_vencem_semana: { formato: "contagem", sentido: "neutro", escopo: "escritorio" },
  autorizacoes_a_validar: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  xml_recusados: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  tarefas_atrasadas_fiscal: { formato: "contagem", sentido: "menor-e-melhor", escopo: "pessoal" },
  tarefas_atrasadas_contabil: { formato: "contagem", sentido: "menor-e-melhor", escopo: "pessoal" },
  transferencias_contabil: { formato: "contagem", sentido: "menor-e-melhor", escopo: "pessoal" },
  // Societário
  exigencias_abertas: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  licencas_a_renovar: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  protocolos_parados: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  // DP
  admissoes_andamento: { formato: "contagem", sentido: "neutro", escopo: "escritorio" },
  rescisoes_andamento: { formato: "contagem", sentido: "neutro", escopo: "escritorio" },
  exames_pendentes: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  // Recrutamento — pelo escopo de /vagas, como as vagas abertas.
  candidaturas_triagem: { formato: "contagem", sentido: "neutro", escopo: "pessoal" },
  entrevistas_semana: { formato: "contagem", sentido: "neutro", escopo: "pessoal" },
  // A foto é o numerador ("12" de "12 de 32"): a variação diz quantas passaram
  // a mais, e por isso é neutra — o total também muda.
  conversao_funil: { formato: "contagem", sentido: "neutro", escopo: "pessoal" },
  // Tech
  chamados_na_fila: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  chamados_atrasados: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  certificados_renovar: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  itens_em_validacao: { formato: "contagem", sentido: "menor-e-melhor", escopo: "escritorio" },
  // Comercial
  leads_novos: { formato: "contagem", sentido: "neutro", escopo: "escritorio" },
  leads_em_contato: { formato: "contagem", sentido: "neutro", escopo: "escritorio" },
  // Controladoria — a fila de solicitações de quem olha.
  solicitacoes_novas: { formato: "contagem", sentido: "menor-e-melhor", escopo: "pessoal" },
  solicitacoes_aguardando_cliente: { formato: "contagem", sentido: "neutro", escopo: "pessoal" },
  solicitacoes_minhas: { formato: "contagem", sentido: "neutro", escopo: "pessoal" },
  // A Academia (Fase 2, 11/11/2026): a sequência de dias do desafio do dia de quem olha.
  academia_desafio_do_dia: { formato: "contagem", sentido: "maior-e-melhor", escopo: "pessoal" },
} as const satisfies Record<string, DefinicaoDaMetrica>;

export type MetricaDaHome = keyof typeof METRICAS;

export const TODAS_AS_METRICAS = Object.keys(METRICAS) as MetricaDaHome[];

export function ehMetricaDaHome(chave: string): chave is MetricaDaHome {
  return Object.prototype.hasOwnProperty.call(METRICAS, chave);
}
