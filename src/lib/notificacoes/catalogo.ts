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
  | "sino"
  // Só da tela (05/10/2026): a caixa das arquivadas na central.
  | "arquivo";

export type Tom = "brand" | "info" | "success" | "warning" | "danger" | "neutral";

export type TipoNoCatalogo = {
  aba: Aba;
  icone: IconeDaNotificacao;
  tom: Tom;
  titulo: string;
  /** Tipo que o código não grava mais: segue na lista, mas não entra nas preferências. */
  legado?: true;
};

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
  // Até 05/10/2026 os dois saíam como GESTAO_ALERTA; separados para dar para
  // desligar o "parado" sem perder o prazo. O antigo fica para as já gravadas.
  GESTAO_PARADO: a("alerta", "warning", "Parado sem movimentação"),
  GESTAO_PRAZO: a("prazo", "warning", "Prazo de card ou processo"),
  GESTAO_ALERTA: { ...a("alerta", "warning", "Alerta da Gestão"), legado: true },
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

/**
 * Os tipos de uma aba. Alertas é o resto: o que não é das outras duas, inclusive tipo novo.
 *
 * `ocultos` (05/10/2026): os tipos que a pessoa desligou nas preferências —
 * saem da aba deles e de "Todas". Só tipo do catálogo é ocultável (ver
 * `ocultosValidos`), então tipo novo e desconhecido nunca some.
 */
export function filtroDaAba(aba: AbaOuTodas, ocultos: string[] = []): { in: string[] } | { notIn: string[] } | undefined {
  const tipos = (de: Aba) => Object.entries(CATALOGO).filter(([, v]) => v.aba === de).map(([k]) => k);
  if (aba === "todas") return ocultos.length > 0 ? { notIn: ocultos } : undefined;
  if (aba === "alertas") return { notIn: [...tipos("para_mim"), ...tipos("clientes"), ...ocultos] };
  const escondidos = new Set(ocultos);
  return { in: tipos(aba).filter((t) => !escondidos.has(t)) };
}

// ─── Preferências: o que cada aba mostra (05/10/2026) ──────────────────────
//
// Padrão = tudo ligado; a pessoa desliga tipo a tipo. O tipo desligado não
// aparece no sino nem nas abas e não manda push, mas continua gravado — religar
// mostra o histórico — e a tela sempre avisa quantos estão ocultos.

/** Os tipos que a pessoa pode desligar, por aba, na ordem do catálogo. O legado fica fora. */
export function tiposConfiguraveis(): { aba: Aba; rotulo: string; tipos: (TipoNoCatalogo & { tipo: string })[] }[] {
  return ABAS.filter((x): x is (typeof ABAS)[number] & { chave: Aba } => x.chave !== "todas").map((x) => ({
    aba: x.chave,
    rotulo: x.rotulo,
    tipos: Object.entries(CATALOGO)
      .filter(([, v]) => v.aba === x.chave && !v.legado)
      .map(([tipo, v]) => ({ ...v, tipo })),
  }));
}

/** Só tipo do catálogo, sem legado e sem repetição — o que vier de fora disso é ignorado. */
export function ocultosValidos(tipos: unknown): string[] {
  if (!Array.isArray(tipos)) return [];
  const validos = new Set<string>();
  for (const t of tipos) {
    if (typeof t === "string" && CATALOGO[t] && !CATALOGO[t].legado) validos.add(t);
  }
  return [...validos];
}

export function ehAba(v: string | undefined | null): v is AbaOuTodas {
  return v === "todas" || v === "para_mim" || v === "clientes" || v === "alertas";
}
