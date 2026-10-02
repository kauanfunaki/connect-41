// O que cada tipo de notificação é, para o sino e a central (02/10/2026):
// a aba, o ícone, o tom e o título curto.
//
// Abas por NATUREZA, e não por setor (decisão do Kauan em 01/10 — por setor,
// quem tem um setor só veria uma aba só):
// - Para mim: alguém da equipe fez algo para você (transferência, menção…);
// - Clientes: veio de fora (portal, candidato, WhatsApp);
// - Alertas: rotina automática (prazo, vencimento, varredura).
//
// Tipo fora do catálogo cai em Alertas, com o sino: nunca some da lista. O
// desenho está em Projects/Connect-41/Central-de-Notificacoes-2026-10-01 no vault.

export type Aba = "para_mim" | "clientes" | "alertas";
export type AbaOuTodas = Aba | "todas";

export type IconeDaNotificacao =
  | "transferencia"
  | "mencao"
  | "comentario"
  | "agenda"
  | "mensagem"
  | "candidato"
  | "whatsapp"
  | "solicitacao"
  | "aprovado"
  | "recusado"
  | "documento"
  | "prazo"
  | "dinheiro"
  | "processo"
  | "alerta"
  | "sino";

export type Tom = "brand" | "info" | "success" | "warning" | "danger" | "neutral";

export type TipoNoCatalogo = { aba: Aba; icone: IconeDaNotificacao; tom: Tom; titulo: string };

export const ABAS: { chave: AbaOuTodas; rotulo: string; descricao: string }[] = [
  { chave: "todas", rotulo: "Todas", descricao: "Tudo o que chegou para você." },
  { chave: "para_mim", rotulo: "Para mim", descricao: "Alguém da equipe fez algo para você: transferência, menção, comentário." },
  { chave: "clientes", rotulo: "Clientes", descricao: "Veio de fora: portal do cliente, candidatos e WhatsApp." },
  { chave: "alertas", rotulo: "Alertas", descricao: "Rotina automática: prazos, vencimentos e varreduras." },
];

const p = (icone: IconeDaNotificacao, tom: Tom, titulo: string): TipoNoCatalogo => ({ aba: "para_mim", icone, tom, titulo });
const c = (icone: IconeDaNotificacao, tom: Tom, titulo: string): TipoNoCatalogo => ({ aba: "clientes", icone, tom, titulo });
const a = (icone: IconeDaNotificacao, tom: Tom, titulo: string): TipoNoCatalogo => ({ aba: "alertas", icone, tom, titulo });

export const CATALOGO: Record<string, TipoNoCatalogo> = {
  // ── Para mim ──
  HANDOFF_RECEIVED: p("transferencia", "brand", "Transferência recebida"),
  HANDOFF_ASSIGNED: p("transferencia", "brand", "Transferência para você"),
  HANDOFF_MENTION: p("mencao", "brand", "Mencionado numa transferência"),
  HANDOFF_SECTOR_DONE: p("aprovado", "success", "Transferência concluída"),
  MENTION: p("mencao", "brand", "Você foi mencionado"),
  COMMENT: p("comentario", "info", "Novo comentário"),
  INTERVIEW_SCHEDULED: p("agenda", "info", "Entrevista agendada"),
  SOLICITACAO_ENCAMINHADA: p("solicitacao", "brand", "Solicitação encaminhada"),

  // ── Clientes ──
  COMPANY_MESSAGE: c("mensagem", "info", "Mensagem do cliente"),
  PROCESS_MESSAGE: c("mensagem", "info", "Mensagem no processo"),
  NEW_APPLICATION: c("candidato", "success", "Nova candidatura"),
  CANDIDATE_UPDATE: c("candidato", "info", "Atualização do candidato"),
  CANDIDATE_DATA_DELETION: c("alerta", "danger", "Pedido de exclusão de dados"),
  ADMISSAO_PREENCHIDA: c("documento", "success", "Admissão preenchida"),
  TESTE_RESPONDIDO: c("documento", "success", "Teste respondido"),
  WHATSAPP_MESSAGE: c("whatsapp", "success", "WhatsApp: mensagem nova"),
  WHATSAPP_HANDOFF: c("whatsapp", "warning", "WhatsApp: precisa de alguém"),
  SOLICITACAO_NOVA: c("solicitacao", "info", "Nova solicitação"),
  SOLICITACAO_RESPOSTA: c("solicitacao", "info", "Resposta na solicitação"),
  SOLICITACAO_CANCELADA: c("solicitacao", "neutral", "Solicitação cancelada"),
  client_request_answered: c("solicitacao", "success", "Pendência respondida"),
  finance_approval_approved: c("aprovado", "success", "Aprovação concedida"),
  finance_approval_rejected: c("recusado", "danger", "Aprovação recusada"),

  // ── Alertas ──
  VACATION_EXPIRING: a("prazo", "warning", "Férias vencendo"),
  PROBATION_DEADLINE: a("prazo", "warning", "Fim da experiência"),
  EXAM_DUE: a("prazo", "warning", "Exame a vencer"),
  TRAINING_EXPIRING: a("prazo", "warning", "Treinamento a vencer"),
  RESCISAO_PRAZO: a("prazo", "danger", "Prazo de rescisão"),
  DOC_EXPIRING: a("documento", "warning", "Documento a vencer"),
  CERT_EXPIRING: a("documento", "warning", "Certificado a vencer"),
  ADMISSAO_STALE: a("alerta", "warning", "Admissão parada"),
  HANDOFF_STALE: a("alerta", "warning", "Transferência parada"),
  FINANCE_CONTAS_DIA: a("dinheiro", "info", "Contas do dia"),
  PENDENCIAS_VENCIDAS: a("prazo", "danger", "Pendências vencidas"),
  ORCAMENTO_ESTOURADO: a("dinheiro", "danger", "Orçamento estourado"),
  GESTAO_ALERTA: a("alerta", "warning", "Alerta da Gestão"),
  OBLIGATION_GENERATED: a("documento", "info", "Obrigação gerada"),
  PROCESS_AVISO_JUNTA: a("processo", "info", "Aviso da Junta"),
  AVISO_ORGAO_SEM_PROCESSO: a("processo", "warning", "Aviso sem processo"),
  PROCESS_VARREDURA: a("processo", "info", "Varredura de processos"),
  LICENCA_VARREDURA: a("processo", "info", "Varredura de licenças"),
  SOLICITACAO_PRAZO: a("prazo", "danger", "Prazo da solicitação"),
};

const DESCONHECIDO: TipoNoCatalogo = { aba: "alertas", icone: "sino", tom: "neutral", titulo: "Aviso" };

export function doTipo(type: string): TipoNoCatalogo {
  return CATALOGO[type] ?? DESCONHECIDO;
}

/** Os tipos de uma aba. Alertas é o resto: o que não é das outras duas, inclusive tipo novo. */
export function filtroDaAba(aba: AbaOuTodas): { in: string[] } | { notIn: string[] } | undefined {
  if (aba === "todas") return undefined;
  const tipos = (de: Aba) => Object.entries(CATALOGO).filter(([, v]) => v.aba === de).map(([k]) => k);
  if (aba === "alertas") return { notIn: [...tipos("para_mim"), ...tipos("clientes")] };
  return { in: tipos(aba) };
}

export function ehAba(v: string | undefined | null): v is AbaOuTodas {
  return v === "todas" || v === "para_mim" || v === "clientes" || v === "alertas";
}
