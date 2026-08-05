// Conferência de rescisão (TRCT). O Connect NÃO calcula verba rescisória — a
// folha aqui é "controle e conferência de lançamentos, não motor de cálculo
// trabalhista" (decisão registrada no próprio schema, ver PayrollCompetency).
//
// O que esta lista faz: estrutura a conferência do que a contabilidade/DP
// externo enviou. Para cada item o conferente registra o valor informado (quando
// é verba), marca CONFERIDO/DIVERGENTE/NAO_APLICAVEL e descreve o que achou.
// Assim a divergência fica rastreável e reportável sem o sistema assumir
// responsabilidade sobre o número.

export type RescisaoCheckGroup = "VERBAS" | "DESCONTOS" | "MEDIAS" | "PRAZOS_DOCS";

export type RescisaoCheckItem = {
  key: string;
  label: string;
  group: RescisaoCheckGroup;
  /** Item de valor monetário — habilita o campo "valor informado". */
  hasValue: boolean;
  /** Ajuda o conferente a saber o que olhar. Não é cálculo, é orientação. */
  hint?: string;
};

export const RESCISAO_GROUP_LABEL: Record<RescisaoCheckGroup, string> = {
  VERBAS: "Verbas rescisórias",
  DESCONTOS: "Descontos e apontamentos",
  MEDIAS: "Médias e variáveis",
  PRAZOS_DOCS: "Prazos e documentos",
};

export const RESCISAO_CHECKLIST: RescisaoCheckItem[] = [
  // ─── Verbas ───────────────────────────────────────────────────────────────
  { key: "saldo_salario", label: "Saldo de salário", group: "VERBAS", hasValue: true, hint: "Dias trabalhados no mês do desligamento." },
  { key: "ferias_vencidas", label: "Férias vencidas", group: "VERBAS", hasValue: true, hint: "Períodos aquisitivos completos e não gozados. Confira contra o módulo de Férias." },
  { key: "ferias_proporcionais", label: "Férias proporcionais", group: "VERBAS", hasValue: true, hint: "Avos do período aquisitivo em curso." },
  { key: "terco_constitucional", label: "1/3 constitucional", group: "VERBAS", hasValue: true, hint: "Incide sobre férias vencidas e proporcionais." },
  { key: "decimo_terceiro", label: "13º proporcional", group: "VERBAS", hasValue: true, hint: "Avos do ano corrente. Verifique se houve adiantamento." },
  { key: "aviso_previo", label: "Aviso prévio", group: "VERBAS", hasValue: true, hint: "Indenizado, trabalhado ou dispensado — confira o tipo registrado." },
  { key: "fgts_deposito", label: "FGTS — depósitos do período", group: "VERBAS", hasValue: true, hint: "Confira se os depósitos do período estão em dia." },
  { key: "fgts_multa", label: "FGTS — multa rescisória", group: "VERBAS", hasValue: true, hint: "Aplicável conforme o motivo do desligamento." },

  // ─── Descontos ────────────────────────────────────────────────────────────
  { key: "faltas_atrasos", label: "Faltas e atrasos", group: "DESCONTOS", hasValue: true, hint: "Confira contra os apontamentos e a escala do período." },
  { key: "adiantamentos", label: "Adiantamentos e vales", group: "DESCONTOS", hasValue: true },
  { key: "inss_irrf", label: "INSS e IRRF", group: "DESCONTOS", hasValue: true },
  { key: "beneficios_desconto", label: "Descontos de benefícios", group: "DESCONTOS", hasValue: true, hint: "Plano de saúde, VT, VR — confira contra os benefícios ativos." },

  // ─── Médias ───────────────────────────────────────────────────────────────
  { key: "media_horas_extras", label: "Média de horas extras", group: "MEDIAS", hasValue: true, hint: "Confira contra os lançamentos de horas extras do período." },
  { key: "media_adicionais", label: "Média de adicionais", group: "MEDIAS", hasValue: true, hint: "Noturno, insalubridade, periculosidade." },
  { key: "media_variaveis", label: "Média de comissões / variáveis", group: "MEDIAS", hasValue: true },

  // ─── Prazos e documentos ──────────────────────────────────────────────────
  { key: "prazo_pagamento", label: "Prazo legal de pagamento", group: "PRAZOS_DOCS", hasValue: false, hint: "CLT art. 477 §6 — 10 dias corridos do término do contrato." },
  { key: "trct_assinado", label: "TRCT assinado", group: "PRAZOS_DOCS", hasValue: false },
  { key: "guias_fgts", label: "Guias de FGTS / chave de movimentação", group: "PRAZOS_DOCS", hasValue: false },
  { key: "exame_demissional", label: "Exame demissional (ASO)", group: "PRAZOS_DOCS", hasValue: false, hint: "Obrigatório salvo dispensa prevista em NR-07." },
  { key: "anotacoes_ctps", label: "Anotações em CTPS / eSocial", group: "PRAZOS_DOCS", hasValue: false },
  { key: "devolucao_itens", label: "Devolução de itens da empresa", group: "PRAZOS_DOCS", hasValue: false, hint: "Crachá, notebook, chaves, uniforme." },
];

export const RESCISAO_CHECK_KEYS: string[] = RESCISAO_CHECKLIST.map((i) => i.key);

export function getRescisaoItem(key: string): RescisaoCheckItem | undefined {
  return RESCISAO_CHECKLIST.find((i) => i.key === key);
}

export function itemsByGroup(group: RescisaoCheckGroup): RescisaoCheckItem[] {
  return RESCISAO_CHECKLIST.filter((i) => i.group === group);
}

export const RESCISAO_GROUP_ORDER: RescisaoCheckGroup[] = ["VERBAS", "DESCONTOS", "MEDIAS", "PRAZOS_DOCS"];

// ─── Prazo legal ─────────────────────────────────────────────────────────────

// CLT art. 477 §6: pagamento em até 10 dias CORRIDOS contados do término do
// contrato. Não é cálculo de verba — é contagem de prazo, que o sistema pode
// fazer com segurança e é justamente o que gera passivo quando estoura.
export const PRAZO_PAGAMENTO_DIAS = 10;

export function prazoPagamento(terminationDate: Date): Date {
  const d = new Date(terminationDate);
  d.setUTCDate(d.getUTCDate() + PRAZO_PAGAMENTO_DIAS);
  return d;
}

export type PrazoStatus = "NO_PRAZO" | "VENCE_HOJE" | "VENCIDO";

export function statusPrazoPagamento(terminationDate: Date, hoje: Date): { dueDate: Date; diasRestantes: number; status: PrazoStatus } {
  const dueDate = prazoPagamento(terminationDate);
  const DAY = 24 * 60 * 60 * 1000;
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diasRestantes = Math.round((startOfDay(dueDate) - startOfDay(hoje)) / DAY);
  const status: PrazoStatus = diasRestantes < 0 ? "VENCIDO" : diasRestantes === 0 ? "VENCE_HOJE" : "NO_PRAZO";
  return { dueDate, diasRestantes, status };
}

// ─── Resumo da conferência ───────────────────────────────────────────────────

export type CheckLike = { itemKey: string; status: string };

export type RescisaoResumo = {
  total: number;
  conferidos: number;
  divergentes: number;
  pendentes: number;
  naoAplicaveis: number;
  /** Conferência completa = nenhum item pendente (divergência não bloqueia). */
  completa: boolean;
  progressoPct: number;
};

export function resumirConferencia(checks: CheckLike[]): RescisaoResumo {
  const byKey = new Map(checks.map((c) => [c.itemKey, c.status]));
  let conferidos = 0;
  let divergentes = 0;
  let naoAplicaveis = 0;
  let pendentes = 0;

  for (const key of RESCISAO_CHECK_KEYS) {
    switch (byKey.get(key)) {
      case "CONFERIDO":
        conferidos++;
        break;
      case "DIVERGENTE":
        divergentes++;
        break;
      case "NAO_APLICAVEL":
        naoAplicaveis++;
        break;
      default:
        pendentes++;
    }
  }

  const total = RESCISAO_CHECK_KEYS.length;
  const tratados = total - pendentes;
  return {
    total,
    conferidos,
    divergentes,
    pendentes,
    naoAplicaveis,
    completa: pendentes === 0,
    progressoPct: total > 0 ? Math.round((tratados / total) * 100) : 0,
  };
}
