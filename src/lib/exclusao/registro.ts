// O registro de tudo que aponta para uma empresa, uma pessoa ou um usuário —
// e do que a exclusão faz com cada coisa.
//
// ─── Por que um registro ────────────────────────────────────────────────────
//
// Excluir de verdade (13/10/2026, pedido do Kauan: "95% da plataforma é
// teste") esbarra em ~130 ligações no banco. Cada uma precisa de uma decisão:
// apagar junto, deixar o banco apagar em cascata, soltar o vínculo ou passar o
// registro para quem está excluindo. A decisão mora aqui, num lugar só, e o
// teste `registro.test.ts` confere este arquivo contra o schema do Prisma:
// uma relação nova com Company, Person ou User que não for classificada aqui
// derruba o teste até alguém decidir o que acontece com ela.
//
// Este arquivo é só dado — sem Prisma, sem servidor. A prévia conta as
// ligações a partir dele (`comum.ts`), e cada serviço (`empresa.ts`,
// `pessoa.ts`, `usuario.ts`) executa o plano dele, também conferido pelo
// teste.

import { formatarNumero } from "@/lib/format";

/**
 * O que acontece com a ligação quando o cadastro é excluído.
 *
 * - `apagar`: o banco recusaria a exclusão (RESTRICT); o serviço apaga antes.
 * - `cascata`: o banco apaga junto sozinho (onDelete: Cascade).
 * - `desligar`: a ligação fica, sem o vínculo (onDelete: SetNull, ou o
 *   serviço anula a coluna).
 * - `reatribuir`: só para usuário — o registro passa para o administrador que
 *   está excluindo.
 */
export type Tratamento = "apagar" | "cascata" | "desligar" | "reatribuir";

/** [singular, plural], sem o número: "nota fiscal" / "notas fiscais". */
export type Rotulo = readonly [string, string];

export type Ligacao = {
  /** Model do schema que aponta para o cadastro ("FiscalDocument"). */
  modelo: string;
  /** Campo de relação no model ("company"). */
  campo: string;
  /** A coluna da chave ("companyId"). */
  fk: string;
  tratamento: Tratamento;
  /** Sem rótulo, a ligação é tratada mas não aparece na prévia. */
  rotulo?: Rotulo;
  /**
   * Conta como histórico: com uma linha que seja, o cadastro só sai pelo modo
   * "com tudo o que está ligado", com o nome digitado.
   */
  historico?: boolean;
};

/**
 * Coluna que guarda o id do cadastro **sem chave estrangeira** — o banco não
 * impede nada, mas a exclusão deixaria a referência solta. Ficam listadas para
 * o teste achar as novas (pelo nome da coluna) e para o serviço tratar.
 *
 * `manter`: a referência fica como está — trilhas de execução e de leitura que
 * guardam quem fez, sem mostrar o nome.
 */
export type ColunaSolta = {
  modelo: string;
  coluna: string;
  tratamento: Tratamento | "manter";
  /** Por que fica como está (só `manter`). */
  motivo?: string;
};

export type Entidade = "Company" | "Person" | "User";

// ─── Empresa ────────────────────────────────────────────────────────────────

const EMPRESA: Ligacao[] = [
  // Histórico — só sai com "Excluir com tudo o que está ligado".
  { modelo: "FiscalDocument", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["nota fiscal", "notas fiscais"], historico: true },
  { modelo: "FinanceEntry", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["lançamento financeiro", "lançamentos financeiros"], historico: true },
  { modelo: "FinanceCounterparty", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["fornecedor ou cliente do financeiro", "fornecedores e clientes do financeiro"], historico: true },
  { modelo: "FinanceCategory", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["categoria própria do plano de contas", "categorias próprias do plano de contas"], historico: true },
  { modelo: "BankAccount", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["conta bancária", "contas bancárias"], historico: true },
  { modelo: "CollectionAgreement", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["acordo de cobrança", "acordos de cobrança"], historico: true },
  { modelo: "CostCenter", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["centro de custo", "centros de custo"], historico: true },
  { modelo: "Budget", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["orçamento", "orçamentos"], historico: true },
  { modelo: "DreImport", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["importação da DRE", "importações da DRE"], historico: true },
  { modelo: "DreCategoryMapping", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["classificação da DRE", "classificações da DRE"], historico: true },
  { modelo: "OmieEmissao", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["nota emitida pelo Omie", "notas emitidas pelo Omie"], historico: true },
  { modelo: "ClientRequest", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["pendência do cliente", "pendências do cliente"], historico: true },
  { modelo: "CompanyMessage", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["mensagem com o cliente", "mensagens com o cliente"], historico: true },
  { modelo: "ServiceRequest", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["solicitação do portal", "solicitações do portal"], historico: true },
  { modelo: "ClientDocument", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["documento enviado ao cliente", "documentos enviados ao cliente"], historico: true },
  { modelo: "Process", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["processo do Societário", "processos do Societário"], historico: true },
  { modelo: "ProcessFee", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["taxa de processo", "taxas de processo"], historico: true },
  { modelo: "License", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["licença", "licenças"], historico: true },
  { modelo: "RecurringObligation", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["obrigação recorrente", "obrigações recorrentes"], historico: true },
  { modelo: "PayrollCompetency", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["competência da folha", "competências da folha"], historico: true },
  { modelo: "Vaga", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["vaga", "vagas"], historico: true },
  // Guarda senha de portal do cliente: sai junto, e não fica solta sem empresa.
  { modelo: "BpoCredential", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["senha do cofre do BPO", "senhas do cofre do BPO"], historico: true },

  // Configuração da empresa no BPO — sai junto, sem contar como histórico.
  { modelo: "FinanceCategoryHidden", campo: "company", fk: "companyId", tratamento: "apagar" },
  { modelo: "PortalApprovalLimit", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["alçada de aprovação", "alçadas de aprovação"] },
  { modelo: "CollectionReminderOptOut", campo: "company", fk: "companyId", tratamento: "apagar" },

  // O banco apaga junto.
  { modelo: "CompanyService", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["setor contratado", "setores contratados"] },
  { modelo: "Department", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["departamento", "departamentos"] },
  { modelo: "Cargo", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["cargo", "cargos"] },
  { modelo: "WorkShift", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["turno", "turnos"] },
  { modelo: "BenefitCatalog", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["benefício cadastrado", "benefícios cadastrados"] },
  { modelo: "CompanyPartner", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["sócio", "sócios"] },
  { modelo: "CompanyRescisaoConfig", campo: "company", fk: "companyId", tratamento: "cascata" },
  // As pastas da casa nascem com a empresa; o que conta como histórico são os
  // arquivos dentro delas (contados à parte em `empresa.ts`).
  { modelo: "DriveFolder", campo: "company", fk: "companyId", tratamento: "cascata" },

  // Ficam, sem o vínculo.
  { modelo: "Company", campo: "parent", fk: "parentCompanyId", tratamento: "desligar", rotulo: ["filial (vira matriz solta)", "filiais (viram matrizes soltas)"] },
  { modelo: "Person", campo: "currentCompany", fk: "currentCompanyId", tratamento: "desligar", rotulo: ["funcionário (fica sem empresa)", "funcionários (ficam sem empresa)"] },
  { modelo: "Meeting", campo: "company", fk: "companyId", tratamento: "desligar", rotulo: ["reunião", "reuniões"] },
  { modelo: "DigitalCertificate", campo: "company", fk: "companyId", tratamento: "desligar", rotulo: ["certificado digital", "certificados digitais"] },
  { modelo: "ChatwootContactLink", campo: "company", fk: "companyId", tratamento: "desligar" },
];

const EMPRESA_SOLTAS: ColunaSolta[] = [
  { modelo: "Document", coluna: "entityId", tratamento: "apagar" },
  { modelo: "CustomValue", coluna: "entityId", tratamento: "apagar" },
  { modelo: "Handoff", coluna: "entityId", tratamento: "apagar" },
  { modelo: "Notification", coluna: "entityId", tratamento: "apagar" },
  { modelo: "PipelineItem", coluna: "entityId", tratamento: "desligar" },
  { modelo: "ValoraProposta", coluna: "companyId", tratamento: "desligar" },
  // Preferência "última empresa aberta": sem a empresa, não vale nada.
  { modelo: "UserLastCompany", coluna: "companyId", tratamento: "apagar" },
  { modelo: "AuditLog", coluna: "entityId", tratamento: "manter", motivo: "a trilha guarda o que foi excluído" },
  { modelo: "AgentRun", coluna: "entityId", tratamento: "manter", motivo: "trilha de execução da IA" },
  { modelo: "AgentProposal", coluna: "entityId", tratamento: "manter", motivo: "proposta da IA já decidida, guardada como trilha" },
];

// ─── Pessoa ─────────────────────────────────────────────────────────────────

const PESSOA: Ligacao[] = [
  { modelo: "Candidatura", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["candidatura", "candidaturas"], historico: true },
  { modelo: "ExameAdmissional", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["exame", "exames"], historico: true },
  { modelo: "SalaryChange", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["alteração de salário", "alterações de salário"], historico: true },
  { modelo: "Vacation", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["período de férias", "períodos de férias"], historico: true },
  { modelo: "Absence", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["afastamento", "afastamentos"], historico: true },
  { modelo: "Termination", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["desligamento", "desligamentos"], historico: true },
  { modelo: "PayrollEntry", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["linha de folha", "linhas de folha"], historico: true },
  { modelo: "OvertimeEntry", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["lançamento de hora extra", "lançamentos de hora extra"], historico: true },
  { modelo: "BenefitAssignment", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["benefício", "benefícios"], historico: true },
  { modelo: "ScheduleEntry", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["dia de escala", "dias de escala"], historico: true },
  { modelo: "TrainingParticipant", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["participação em treinamento", "participações em treinamento"], historico: true },
  { modelo: "Evaluation", campo: "person", fk: "personId", tratamento: "apagar", rotulo: ["avaliação de desempenho", "avaliações de desempenho"], historico: true },

  // O banco apaga junto. Teste respondido é resultado do candidato: conta como
  // histórico mesmo indo em cascata.
  { modelo: "AssessmentLink", campo: "person", fk: "personId", tratamento: "cascata", rotulo: ["teste enviado", "testes enviados"], historico: true },
  { modelo: "AdmissaoLink", campo: "person", fk: "personId", tratamento: "cascata", rotulo: ["link de admissão digital", "links de admissão digital"] },
  { modelo: "Dependente", campo: "person", fk: "personId", tratamento: "cascata", rotulo: ["dependente", "dependentes"] },
  { modelo: "PersonTag", campo: "person", fk: "personId", tratamento: "cascata" },

  { modelo: "ChatwootContactLink", campo: "person", fk: "personId", tratamento: "desligar" },
];

const PESSOA_SOLTAS: ColunaSolta[] = [
  { modelo: "Document", coluna: "entityId", tratamento: "apagar" },
  { modelo: "CustomValue", coluna: "entityId", tratamento: "apagar" },
  { modelo: "Handoff", coluna: "entityId", tratamento: "apagar" },
  { modelo: "Notification", coluna: "entityId", tratamento: "apagar" },
  { modelo: "PipelineItem", coluna: "entityId", tratamento: "desligar" },
  { modelo: "WhatsappThread", coluna: "personId", tratamento: "desligar" },
  { modelo: "WhatsappThread", coluna: "linkPendingPersonId", tratamento: "desligar" },
  { modelo: "WhatsappThread", coluna: "candidaturaId", tratamento: "desligar" },
  // O resumo do currículo lido pela IA na ficha do candidato (14/10/2026): sai
  // com a pessoa. Tabela sem chave — o passo tolera a tabela ainda não existir.
  { modelo: "CandidateResumeSummary", coluna: "personId", tratamento: "apagar" },
  { modelo: "AuditLog", coluna: "entityId", tratamento: "manter", motivo: "a trilha guarda o que foi excluído" },
  { modelo: "AgentRun", coluna: "entityId", tratamento: "manter", motivo: "trilha de execução da IA" },
  { modelo: "AgentProposal", coluna: "entityId", tratamento: "manter", motivo: "proposta da IA já decidida, guardada como trilha" },
];

// ─── Usuário ────────────────────────────────────────────────────────────────
//
// Usuário de teste pode ter trabalhado em empresa de verdade: o que ele fez
// não é apagado. Quem criou passa a ser o administrador que exclui (decisão do
// Kauan, 13/10/2026), e a prévia diz quantos registros mudam de mãos.

const USUARIO: Ligacao[] = [
  // Autor obrigatório no banco — passa para quem exclui.
  { modelo: "Activity", campo: "user", fk: "userId", tratamento: "reatribuir", rotulo: ["comentário ou movimentação no Kanban", "comentários e movimentações no Kanban"], historico: true },
  { modelo: "TimeEntry", campo: "user", fk: "userId", tratamento: "reatribuir", rotulo: ["apontamento de horas", "apontamentos de horas"], historico: true },
  { modelo: "Document", campo: "uploadedBy", fk: "uploadedById", tratamento: "reatribuir", rotulo: ["documento anexado", "documentos anexados"], historico: true },
  { modelo: "ClientDocument", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["documento enviado ao cliente", "documentos enviados ao cliente"], historico: true },
  { modelo: "Handoff", campo: "requester", fk: "requestedBy", tratamento: "reatribuir", rotulo: ["transferência pedida", "transferências pedidas"], historico: true },
  { modelo: "Meeting", campo: "createdBy", fk: "createdByUserId", tratamento: "reatribuir", rotulo: ["reunião criada", "reuniões criadas"], historico: true },
  { modelo: "Evaluation", campo: "evaluator", fk: "evaluatorUserId", tratamento: "reatribuir", rotulo: ["avaliação de desempenho feita", "avaliações de desempenho feitas"], historico: true },
  { modelo: "InterviewScorecard", campo: "evaluator", fk: "evaluatorUserId", tratamento: "reatribuir", rotulo: ["avaliação de entrevista", "avaliações de entrevista"], historico: true },
  { modelo: "AdmissaoLink", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["link de admissão digital", "links de admissão digital"], historico: true },
  { modelo: "AssessmentLink", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["teste enviado", "testes enviados"], historico: true },
  { modelo: "AssessmentTemplate", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["modelo de teste", "modelos de teste"], historico: true },
  { modelo: "Budget", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["orçamento", "orçamentos"], historico: true },
  { modelo: "ManualDocument", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["manual do BPO", "manuais do BPO"], historico: true },
  { modelo: "ManualPage", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["página de manual", "páginas de manual"], historico: true },
  { modelo: "BpoCredential", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["senha do cofre do BPO", "senhas do cofre do BPO"], historico: true },
  { modelo: "ValoraProposta", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["proposta do Valora", "propostas do Valora"], historico: true },

  // Registro de quem viu uma senha do cofre. Passar para outra pessoa seria
  // dizer que ela viu; a tabela não tem migration no repositório (drift de
  // produção), então não vira SetNull: as linhas saem e a lista — senha e
  // data — fica guardada no registro da exclusão.
  { modelo: "BpoCredentialView", campo: "user", fk: "userId", tratamento: "apagar", rotulo: ["visualização de senha do cofre (fica guardada no registro da exclusão)", "visualizações de senha do cofre (ficam guardadas no registro da exclusão)"], historico: true },

  // A trilha fica, com o nome (migration 20261013200000).
  { modelo: "AuditLog", campo: "user", fk: "userId", tratamento: "desligar", rotulo: ["registro na auditoria (fica, com o nome dele)", "registros na auditoria (ficam, com o nome dele)"] },

  // Responsável por algo — fica sem responsável.
  { modelo: "Person", campo: "linkedUser", fk: "linkedUserId", tratamento: "desligar", rotulo: ["ficha em Pessoas ligada à conta", "fichas em Pessoas ligadas à conta"] },
  { modelo: "CompanyService", campo: "responsible", fk: "responsibleUserId", tratamento: "desligar", rotulo: ["setor contratado em que ele é o responsável", "setores contratados em que ele é o responsável"] },
  { modelo: "RecurringObligation", campo: "responsible", fk: "responsibleId", tratamento: "desligar", rotulo: ["obrigação recorrente sob responsabilidade dele", "obrigações recorrentes sob responsabilidade dele"] },
  { modelo: "Process", campo: "owner", fk: "ownerUserId", tratamento: "desligar", rotulo: ["processo do Societário sob responsabilidade dele", "processos do Societário sob responsabilidade dele"] },
  { modelo: "ServiceRequest", campo: "assignee", fk: "assigneeId", tratamento: "desligar", rotulo: ["solicitação do portal atribuída a ele", "solicitações do portal atribuídas a ele"] },
  { modelo: "Lead", campo: "assignee", fk: "assigneeId", tratamento: "desligar", rotulo: ["lead sob responsabilidade dele", "leads sob responsabilidade dele"] },
  { modelo: "WhatsappThread", campo: "assignedTo", fk: "assignedToId", tratamento: "desligar", rotulo: ["conversa do WhatsApp atribuída a ele", "conversas do WhatsApp atribuídas a ele"] },
  { modelo: "FinanceEntry", campo: "collectionOwner", fk: "collectionOwnerId", tratamento: "desligar", rotulo: ["cobrança sob responsabilidade dele", "cobranças sob responsabilidade dele"] },

  // Autor opcional — o registro fica e deixa de mostrar o nome. Entram na
  // prévia numa linha só ("ficam sem o nome dele como autor").
  { modelo: "AgentProposal", campo: "createdBy", fk: "createdById", tratamento: "desligar" },
  { modelo: "AgentProposal", campo: "reviewedBy", fk: "reviewedById", tratamento: "desligar" },
  { modelo: "AvisoDeOrgao", campo: "reviewedBy", fk: "reviewedByUserId", tratamento: "desligar" },
  { modelo: "BankStatementImport", campo: "importedBy", fk: "importedById", tratamento: "desligar" },
  { modelo: "BankTransaction", campo: "reconciledBy", fk: "reconciledById", tratamento: "desligar" },
  { modelo: "BankTransactionMatch", campo: "createdBy", fk: "createdById", tratamento: "desligar" },
  { modelo: "Budget", campo: "approvedBy", fk: "approvedById", tratamento: "desligar" },
  { modelo: "ChatwootAgentLink", campo: "linkedUser", fk: "linkedUserId", tratamento: "desligar" },
  { modelo: "ClientAnnouncement", campo: "createdBy", fk: "createdById", tratamento: "desligar" },
  { modelo: "ClientRequest", campo: "createdBy", fk: "createdById", tratamento: "desligar" },
  { modelo: "ClientRequest", campo: "resolvedBy", fk: "resolvedById", tratamento: "desligar" },
  { modelo: "ClientRequestAttachment", campo: "uploadedByUser", fk: "uploadedByUserId", tratamento: "desligar" },
  { modelo: "ClientRequestMessage", campo: "authorUser", fk: "authorUserId", tratamento: "desligar" },
  { modelo: "CollectionAgreement", campo: "closedBy", fk: "closedById", tratamento: "desligar" },
  { modelo: "CollectionAgreement", campo: "createdBy", fk: "createdById", tratamento: "desligar" },
  { modelo: "CollectionContact", campo: "user", fk: "userId", tratamento: "desligar" },
  { modelo: "CollectionEvent", campo: "user", fk: "userId", tratamento: "desligar" },
  { modelo: "CollectionReminderConfig", campo: "updatedBy", fk: "updatedById", tratamento: "desligar" },
  { modelo: "CollectionReminderOptOut", campo: "createdBy", fk: "createdById", tratamento: "desligar" },
  { modelo: "CompanyMessage", campo: "authorUser", fk: "authorUserId", tratamento: "desligar" },
  { modelo: "DriveFile", campo: "uploadedByUser", fk: "uploadedByUserId", tratamento: "desligar" },
  { modelo: "FinanceApprovalEvent", campo: "actorUser", fk: "actorUserId", tratamento: "desligar" },
  { modelo: "FinanceEntry", campo: "createdBy", fk: "createdById", tratamento: "desligar" },
  { modelo: "FinanceEntry", campo: "lossBy", fk: "lossById", tratamento: "desligar" },
  { modelo: "FinanceEntry", campo: "reviewedBy", fk: "reviewedById", tratamento: "desligar" },
  { modelo: "FiscalDocument", campo: "uploadedBy", fk: "uploadedById", tratamento: "desligar" },
  { modelo: "ProcessDocument", campo: "uploadedByUser", fk: "uploadedByUserId", tratamento: "desligar" },
  { modelo: "ProcessMessage", campo: "authorUser", fk: "authorUserId", tratamento: "desligar" },
  { modelo: "ProcessStep", campo: "executedBy", fk: "executedByUserId", tratamento: "desligar" },
  { modelo: "ServiceRequest", campo: "closedBy", fk: "closedById", tratamento: "desligar" },
  { modelo: "ServiceRequestAttachment", campo: "uploadedByUser", fk: "uploadedByUserId", tratamento: "desligar" },
  { modelo: "ServiceRequestMessage", campo: "authorUser", fk: "authorUserId", tratamento: "desligar" },
  { modelo: "TerminationCheck", campo: "checkedBy", fk: "checkedById", tratamento: "desligar" },
  { modelo: "VagaRecrutador", campo: "createdBy", fk: "createdById", tratamento: "desligar" },
  { modelo: "WhatsappAtendimento", campo: "encerradoPor", fk: "encerradoPorId", tratamento: "desligar" },

  // Da própria conta — o banco apaga junto.
  { modelo: "AgentConversation", campo: "user", fk: "userId", tratamento: "cascata", rotulo: ["conversa com a Ceci", "conversas com a Ceci"] },
  { modelo: "Notification", campo: "user", fk: "userId", tratamento: "cascata", rotulo: ["notificação", "notificações"] },
  { modelo: "PipelineItemAssignee", campo: "user", fk: "userId", tratamento: "cascata", rotulo: ["atribuição de tarefa do Kanban (a tarefa fica, sem ele)", "atribuições de tarefa do Kanban (as tarefas ficam, sem ele)"] },
  { modelo: "VagaRecrutador", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "PipelineItemWatcher", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "HandoffSectorAssignee", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "HandoffView", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "MeetingAttendee", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "NotificationHiddenType", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "OAuthAccount", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "PushSubscription", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "UserAgendaConfig", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "UserPinnedModule", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "UserPreference", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "UserSector", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "UserTenantAccess", campo: "user", fk: "userId", tratamento: "cascata" },
];

const USUARIO_SOLTAS: ColunaSolta[] = [
  // Sessão e troca de senha: saem com a conta.
  { modelo: "RefreshToken", coluna: "userId", tratamento: "apagar" },
  { modelo: "PasswordResetToken", coluna: "userId", tratamento: "apagar" },
  // Preferência "última empresa aberta": sai com a conta.
  { modelo: "UserLastCompany", coluna: "userId", tratamento: "apagar" },
  // O tutorial do primeiro acesso já visto: sai com a conta. A mesma coluna
  // guarda o id de acessos do portal (subject PORTAL_USER) — esses saem com o
  // acesso (`excluirAcessoDoPortal`, `excluirCliente`).
  { modelo: "TutorialVisto", coluna: "userId", tratamento: "apagar" },
  // Autor guardado sem chave — passa para quem exclui, como os de cima.
  { modelo: "CandidaturaNota", coluna: "createdById", tratamento: "reatribuir" },
  { modelo: "VagaRequisitos", coluna: "createdById", tratamento: "reatribuir" },
  { modelo: "DriveFolder", coluna: "createdById", tratamento: "reatribuir" },
  { modelo: "OmieEmissao", coluna: "pedidoPorId", tratamento: "reatribuir" },
  { modelo: "OmieEmissao", coluna: "canceladaPorId", tratamento: "reatribuir" },
  { modelo: "DreImport", coluna: "importedById", tratamento: "reatribuir" },
  // Responsável e cronômetro ligado: ficam vazios.
  { modelo: "Company", coluna: "responsibleUserId", tratamento: "desligar" },
  { modelo: "Vaga", coluna: "responsibleUserId", tratamento: "desligar" },
  { modelo: "PipelineItem", coluna: "activeTimerUserId", tratamento: "desligar" },
  { modelo: "Process", coluna: "activeTimerUserId", tratamento: "desligar" },
  // Trilhas que guardam o id de quem fez e não mostram o nome.
  { modelo: "Notification", coluna: "actorUserId", tratamento: "manter", motivo: "a notificação já foi entregue; o texto leva o nome" },
  { modelo: "AgentRun", coluna: "userId", tratamento: "manter", motivo: "trilha de execução da IA" },
  { modelo: "SerproCall", coluna: "userId", tratamento: "manter", motivo: "trilha de consultas ao Serpro (cobradas por chamada)" },
  { modelo: "AccessAuthorization", coluna: "updatedByUserId", tratamento: "manter", motivo: "trilha de quem mexeu na autorização" },
  { modelo: "AccessAuthorizationGrantee", coluna: "updatedByUserId", tratamento: "manter", motivo: "trilha de quem mexeu na autorização" },
  { modelo: "DriveFolderSeen", coluna: "seenByUserId", tratamento: "manter", motivo: "marca de leitura da pasta de enviados" },
  { modelo: "DriveFile", coluna: "deletedById", tratamento: "manter", motivo: "lixeira dos Arquivos, que se esvazia sozinha" },
  { modelo: "DriveFolder", coluna: "deletedById", tratamento: "manter", motivo: "lixeira dos Arquivos, que se esvazia sozinha" },
];

export const LIGACOES: Record<Entidade, readonly Ligacao[]> = {
  Company: EMPRESA,
  Person: PESSOA,
  User: USUARIO,
};

export const COLUNAS_SOLTAS: Record<Entidade, readonly ColunaSolta[]> = {
  Company: EMPRESA_SOLTAS,
  Person: PESSOA_SOLTAS,
  User: USUARIO_SOLTAS,
};

/** "312 notas fiscais", "1 vaga". */
export function contagem(n: number, [singular, plural]: Rotulo): string {
  return `${formatarNumero(n, 0)} ${n === 1 ? singular : plural}`;
}
