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
  { modelo: "FinanceEntryPayment", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["baixa", "baixas"], historico: true },
  { modelo: "FinanceCounterparty", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["fornecedor ou cliente do financeiro", "fornecedores e clientes do financeiro"], historico: true },
  { modelo: "FinanceCategory", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["categoria própria do plano de contas", "categorias próprias do plano de contas"], historico: true },
  { modelo: "BankAccount", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["conta bancária", "contas bancárias"], historico: true },
  { modelo: "CollectionAgreement", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["acordo de cobrança", "acordos de cobrança"], historico: true },
  { modelo: "CostCenter", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["centro de custo", "centros de custo"], historico: true },
  { modelo: "FinanceProject", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["projeto", "projetos"], historico: true },
  { modelo: "Budget", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["orçamento", "orçamentos"], historico: true },
  { modelo: "DreImport", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["importação da DRE", "importações da DRE"], historico: true },
  // Revisão do fechamento (05/11/2026): documentos, execuções e acompanhamento vão em cascata; os arquivos, por `arquivosDaEmpresa`.
  { modelo: "RevisaoFechamento", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["revisão do fechamento", "revisões do fechamento"], historico: true },
  // Contábil Core (09/11/2026): a empresa no Contábil Core leva junto plano de contas, contas bancárias,
  // extratos, regras e lançamentos, apagados em ordem por `PASSOS_DO_CONTABIL_CORE` (sem cascata no banco).
  { modelo: "CoreEmpresa", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["empresa no Contábil Core", "empresas no Contábil Core"], historico: true },
  { modelo: "DreCategoryMapping", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["classificação da DRE", "classificações da DRE"], historico: true },
  { modelo: "DrePublicacao", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["mês da DRE publicado no portal", "meses da DRE publicados no portal"], historico: true },
  { modelo: "DrePublicacaoEmpresa", campo: "company", fk: "companyId", tratamento: "apagar", rotulo: ["marca da foto inicial da DRE", "marcas da foto inicial da DRE"], historico: true },
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
  // DP 2 (11/11/2026): a folha calculada da empresa (lançamentos, cálculos e
  // comparativos vão juntos com a competência), a configuração e os contratos.
  { modelo: "Dp2Competencia", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["competência do DP 2", "competências do DP 2"], historico: true },
  { modelo: "Dp2EmpresaConfig", campo: "company", fk: "companyId", tratamento: "cascata" },
  { modelo: "Dp2Vinculo", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["contrato do DP 2", "contratos do DP 2"], historico: true },
  { modelo: "Dp2EventoEsocial", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["evento do eSocial do DP 2", "eventos do eSocial do DP 2"], historico: true },
  // As pastas da casa nascem com a empresa; o que conta como histórico são os
  // arquivos dentro delas (contados à parte em `empresa.ts`).
  { modelo: "DriveFolder", campo: "company", fk: "companyId", tratamento: "cascata" },
  // O registro do que o robô da pasta de rede já trouxe (21/10/2026) vai junto com a empresa.
  { modelo: "DriveNetworkFile", campo: "company", fk: "companyId", tratamento: "cascata" },
  // Honorários (vindos do Aditiva Pronto, 11/11/2026). O vínculo da pasta fica,
  // sem a empresa, e volta para as pendências da tela Pastas; o valor informado
  // à mão e a marca de "sem pasta" saem com a empresa; o histórico de envios ao
  // Acessórias conta como histórico.
  { modelo: "HonorarioVinculoPasta", campo: "company", fk: "companyId", tratamento: "desligar", rotulo: ["pasta de contrato (fica sem empresa)", "pastas de contrato (ficam sem empresa)"] },
  { modelo: "HonorarioEmpresaSemPasta", campo: "company", fk: "companyId", tratamento: "cascata" },
  { modelo: "HonorarioManual", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["honorário informado à mão", "honorários informados à mão"] },
  { modelo: "HonorarioAcessoriasEnvio", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["envio de honorário ao Acessórias", "envios de honorário ao Acessórias"], historico: true },
  // Portal por empresa (14/10/2026): sai a ligação da empresa com o acesso, e
  // a conta continua (com as outras empresas dela, ou sem nenhuma). O
  // comunicado já enviado fica, sem esta empresa entre os destinatários.
  { modelo: "PortalUserCompany", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["acesso ao portal ligado a ela (a conta continua)", "acessos ao portal ligados a ela (as contas continuam)"] },
  { modelo: "ClientAnnouncementCompany", campo: "company", fk: "companyId", tratamento: "cascata" },
  { modelo: "DominioAccountMap", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["conta do de-para da Domínio", "contas do de-para da Domínio"] },
  { modelo: "DominioExportacao", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["planilha da Domínio baixada", "planilhas da Domínio baixadas"] },
  { modelo: "ContabilRegra", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["regra do de-para contábil", "regras do de-para contábil"] },
  { modelo: "ContabilConta", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["conta do plano da Domínio", "contas do plano da Domínio"] },
  { modelo: "ContabilCfopConta", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["sugestão contábil de CFOP", "sugestões contábeis de CFOP"] },
  { modelo: "ContabilModelo", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["configuração do Contábil", "configurações do Contábil"] },
  { modelo: "ContabilDocumentoPagamento", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["documento de pagamentos sem nota", "documentos de pagamentos sem nota"] },
  { modelo: "ContabilPagamento", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["pagamento sem nota", "pagamentos sem nota"] },
  { modelo: "ContabilPagamentoCategoria", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["regra de categoria de pagamento", "regras de categoria de pagamento"] },
  { modelo: "ContabilPagamentoNome", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["conta de fornecedor sem CPF/CNPJ", "contas de fornecedor sem CPF/CNPJ"] },
  { modelo: "ContabilContaPagamento", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["conta dos pagamentos sem nota", "contas dos pagamentos sem nota"] },
  { modelo: "ContabilContaSaida", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["conta das saídas", "contas das saídas"] },
  { modelo: "Guia", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["guia emitida", "guias emitidas"] },
  { modelo: "Certidao", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["certidão consultada", "certidões consultadas"] },
  { modelo: "BankReconciliationRule", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["regra de conciliação", "regras de conciliação"] },
  { modelo: "FinanceRecurrence", campo: "company", fk: "companyId", tratamento: "cascata", rotulo: ["série de repetição", "séries de repetição"] },
  // A marca de cada obrigação por regime gerada (22/10/2026). A atividade em si
  // é um PipelineItem, que fica sem a empresa como as outras.
  { modelo: "ObrigacaoGerada", campo: "company", fk: "companyId", tratamento: "cascata" },

  // Ficam, sem o vínculo.
  { modelo: "Company", campo: "parent", fk: "parentCompanyId", tratamento: "desligar", rotulo: ["filial (vira matriz solta)", "filiais (viram matrizes soltas)"] },
  { modelo: "Person", campo: "currentCompany", fk: "currentCompanyId", tratamento: "desligar", rotulo: ["funcionário (fica sem empresa)", "funcionários (ficam sem empresa)"] },
  { modelo: "Meeting", campo: "company", fk: "companyId", tratamento: "desligar", rotulo: ["reunião", "reuniões"] },
  { modelo: "DigitalCertificate", campo: "company", fk: "companyId", tratamento: "desligar", rotulo: ["certificado digital", "certificados digitais"] },
  { modelo: "ChatwootContactLink", campo: "company", fk: "companyId", tratamento: "desligar" },
  // Planejamento tributário (05/11/2026): a avaliação guarda nome e CNPJ nos
  // próprios dados e segue aberta como prospecto (onDelete: SetNull).
  { modelo: "AvaliacaoTributaria", campo: "company", fk: "companyId", tratamento: "desligar", rotulo: ["avaliação tributária (fica, como prospecto)", "avaliações tributárias (ficam, como prospecto)"] },
];

const EMPRESA_SOLTAS: ColunaSolta[] = [
  // A exclusão de um cadastro não autoriza apagar a escrituração nem as
  // revisões fiscais. A retenção desse histórico exige uma operação própria.
  // SpedFiscalGeneration (06/11/2026): o arquivo que o agente do motor gerou, guardado com a revisão.
  ...["SpedFiscalProfile", "SpedFiscalBook", "SpedFiscalSupport", "SpedFiscalPeriod", "SpedFiscalCalculation", "SpedFiscalRevision", "SpedFiscalImport", "SpedFiscalGeneration"].map((modelo): ColunaSolta => ({ modelo, coluna: "companyId", tratamento: "manter", motivo: "histórico fiscal e revisões preservados; retenção não é exclusão do cadastro" })),
  { modelo: "Document", coluna: "entityId", tratamento: "apagar" },
  { modelo: "CustomValue", coluna: "entityId", tratamento: "apagar" },
  { modelo: "Handoff", coluna: "entityId", tratamento: "apagar" },
  { modelo: "Notification", coluna: "entityId", tratamento: "apagar" },
  { modelo: "PipelineItem", coluna: "entityId", tratamento: "desligar" },
  { modelo: "ValoraProposta", coluna: "companyId", tratamento: "desligar" },
  // A fila do robô do Societário (30/10/2026): o PDF que a tarefa guardou
  // mora nos Arquivos da empresa, que vão junto.
  { modelo: "RobotTask", coluna: "companyId", tratamento: "apagar" },
  // O contato do Atendimento (10/11/2026) volta a ser só um telefone.
  { modelo: "AtendimentoContato", coluna: "companyId", tratamento: "manter", motivo: "o contato do Atendimento é do telefone; empresa que some vira só o nome do WhatsApp na tela" },
  // XML recusado pelo leitor (06/11/2026): o arquivo é da empresa e guarda os dados dela.
  { modelo: "FiscalXmlRefusal", coluna: "companyId", tratamento: "apagar" },
  // O pedido de situação fiscal da ficha (Serpro, 20/10/2026): sem a empresa, não serve a ninguém.
  { modelo: "SerproPedido", coluna: "companyId", tratamento: "apagar" },
  // Preferência "última empresa aberta": sem a empresa, não vale nada.
  { modelo: "UserLastCompany", coluna: "companyId", tratamento: "apagar" },
  { modelo: "BankRuleApplication", coluna: "companyId", tratamento: "apagar" },
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
  // DP 2 (11/11/2026): o contrato e a folha calculada da pessoa.
  { modelo: "Dp2Vinculo", campo: "person", fk: "personId", tratamento: "cascata", rotulo: ["contrato do DP 2", "contratos do DP 2"], historico: true },
  { modelo: "Dp2Evento", campo: "person", fk: "personId", tratamento: "cascata", rotulo: ["lançamento do DP 2", "lançamentos do DP 2"], historico: true },
  { modelo: "Dp2Calculo", campo: "person", fk: "personId", tratamento: "cascata", rotulo: ["holerite do DP 2", "holerites do DP 2"], historico: true },
  { modelo: "Dp2Comparativo", campo: "person", fk: "personId", tratamento: "cascata" },
  { modelo: "Dp2EventoEsocial", campo: "person", fk: "personId", tratamento: "cascata", rotulo: ["evento do eSocial do DP 2", "eventos do eSocial do DP 2"], historico: true },

  { modelo: "ChatwootContactLink", campo: "person", fk: "personId", tratamento: "desligar" },
];

const PESSOA_SOLTAS: ColunaSolta[] = [
  { modelo: "Document", coluna: "entityId", tratamento: "apagar" },
  { modelo: "CustomValue", coluna: "entityId", tratamento: "apagar" },
  { modelo: "Handoff", coluna: "entityId", tratamento: "apagar" },
  { modelo: "Notification", coluna: "entityId", tratamento: "apagar" },
  { modelo: "PipelineItem", coluna: "entityId", tratamento: "desligar" },
  { modelo: "WhatsappThread", coluna: "personId", tratamento: "desligar" },
  { modelo: "AtendimentoContato", coluna: "personId", tratamento: "manter", motivo: "o contato do Atendimento é do telefone; pessoa que some vira só o nome do WhatsApp na tela" },
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
  { modelo: "Activity", campo: "user", fk: "userId", tratamento: "reatribuir", rotulo: ["comentário ou movimentação nos Quadros", "comentários e movimentações nos Quadros"], historico: true },
  { modelo: "TimeEntry", campo: "user", fk: "userId", tratamento: "reatribuir", rotulo: ["apontamento de horas", "apontamentos de horas"], historico: true },
  { modelo: "Document", campo: "uploadedBy", fk: "uploadedById", tratamento: "reatribuir", rotulo: ["documento anexado", "documentos anexados"], historico: true },
  { modelo: "ClientDocument", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["documento enviado ao cliente", "documentos enviados ao cliente"], historico: true },
  { modelo: "Handoff", campo: "requester", fk: "requestedBy", tratamento: "reatribuir", rotulo: ["transferência pedida", "transferências pedidas"], historico: true },
  // A Atividade da transferência aberta (10/11/2026): comentário, devolução,
  // começo e fim de parte passam para quem exclui, como os comentários dos Quadros.
  { modelo: "HandoffEvent", campo: "user", fk: "userId", tratamento: "reatribuir", rotulo: ["comentário ou movimentação em transferência", "comentários e movimentações em transferências"], historico: true },
  { modelo: "Meeting", campo: "createdBy", fk: "createdByUserId", tratamento: "reatribuir", rotulo: ["reunião criada", "reuniões criadas"], historico: true },
  { modelo: "Evaluation", campo: "evaluator", fk: "evaluatorUserId", tratamento: "reatribuir", rotulo: ["avaliação de desempenho feita", "avaliações de desempenho feitas"], historico: true },
  { modelo: "InterviewScorecard", campo: "evaluator", fk: "evaluatorUserId", tratamento: "reatribuir", rotulo: ["avaliação de entrevista", "avaliações de entrevista"], historico: true },
  { modelo: "AdmissaoLink", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["link de admissão digital", "links de admissão digital"], historico: true },
  { modelo: "AssessmentLink", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["teste enviado", "testes enviados"], historico: true },
  { modelo: "AssessmentTemplate", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["modelo de teste", "modelos de teste"], historico: true },
  { modelo: "Budget", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["orçamento", "orçamentos"], historico: true },
  { modelo: "ManualDocument", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["manual do BPO", "manuais do BPO"], historico: true },
  { modelo: "ManualPage", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["página de manual", "páginas de manual"], historico: true },
  // As do setor passam; as PESSOAIS dele (10/11/2026) saem antes, num passo
  // próprio do plano (`usuario.ts`): só ele as via, e passá-las a quem exclui
  // entregaria ao administrador senhas que a regra nunca o deixou revelar.
  { modelo: "BpoCredential", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["senha do cofre do BPO", "senhas do cofre do BPO"], historico: true },
  { modelo: "ValoraProposta", campo: "createdBy", fk: "createdById", tratamento: "reatribuir", rotulo: ["proposta do Valora", "propostas do Valora"], historico: true },

  // Registro de quem viu uma senha do cofre. Passar para outra pessoa seria
  // dizer que ela viu; a tabela não tem migration no repositório (drift de
  // produção), então não vira SetNull: as linhas saem e a lista — senha e
  // data — fica guardada no registro da exclusão.
  { modelo: "BpoCredentialView", campo: "user", fk: "userId", tratamento: "apagar", rotulo: ["visualização de senha do cofre (fica guardada no registro da exclusão)", "visualizações de senha do cofre (ficam guardadas no registro da exclusão)"], historico: true },

  // A trilha fica, com o nome (migration 20261013200000).
  { modelo: "AuditLog", campo: "user", fk: "userId", tratamento: "desligar", rotulo: ["registro na auditoria (fica, com o nome dele)", "registros na auditoria (ficam, com o nome dele)"] },

  // Autoria das avaliações tributárias (05/11/2026): a avaliação e as versões
  // ficam, sem o autor (onDelete: SetNull) — a trilha está na auditoria.
  { modelo: "AvaliacaoTributaria", campo: "criadoPor", fk: "criadoPorId", tratamento: "desligar", rotulo: ["avaliação tributária criada por ele (fica, sem o autor)", "avaliações tributárias criadas por ele (ficam, sem o autor)"] },
  { modelo: "AvaliacaoTributaria", campo: "atualizadoPor", fk: "atualizadoPorId", tratamento: "desligar" },
  { modelo: "AvaliacaoTributariaVersao", campo: "autor", fk: "autorId", tratamento: "desligar" },

  // Responsável por algo — fica sem responsável.
  { modelo: "Person", campo: "linkedUser", fk: "linkedUserId", tratamento: "desligar", rotulo: ["ficha em Pessoas ligada à conta", "fichas em Pessoas ligadas à conta"] },
  { modelo: "CompanyService", campo: "responsible", fk: "responsibleUserId", tratamento: "desligar", rotulo: ["setor contratado em que ele é o responsável", "setores contratados em que ele é o responsável"] },
  { modelo: "RecurringObligation", campo: "responsible", fk: "responsibleId", tratamento: "desligar", rotulo: ["obrigação recorrente sob responsabilidade dele", "obrigações recorrentes sob responsabilidade dele"] },
  { modelo: "Process", campo: "owner", fk: "ownerUserId", tratamento: "desligar", rotulo: ["processo do Societário sob responsabilidade dele", "processos do Societário sob responsabilidade dele"] },
  { modelo: "ServiceRequest", campo: "assignee", fk: "assigneeId", tratamento: "desligar", rotulo: ["solicitação do portal atribuída a ele", "solicitações do portal atribuídas a ele"] },
  { modelo: "Lead", campo: "assignee", fk: "assigneeId", tratamento: "desligar", rotulo: ["lead sob responsabilidade dele", "leads sob responsabilidade dele"] },
  { modelo: "OpsWatcher", campo: "owner", fk: "ownerId", tratamento: "desligar", rotulo: ["automação sob responsabilidade dele", "automações sob responsabilidade dele"] },
  { modelo: "OpsSite", campo: "owner", fk: "ownerId", tratamento: "desligar", rotulo: ["site sob responsabilidade dele", "sites sob responsabilidade dele"] },
  { modelo: "OpsApp", campo: "owner", fk: "ownerId", tratamento: "desligar", rotulo: ["app sob responsabilidade dele", "apps sob responsabilidade dele"] },
  { modelo: "TechInternalItem", campo: "assignee", fk: "assigneeId", tratamento: "desligar", rotulo: ["item do Tech sob responsabilidade dele", "itens do Tech sob responsabilidade dele"] },
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
  { modelo: "FinanceEntryPayment", campo: "createdBy", fk: "createdById", tratamento: "desligar" },
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
  { modelo: "FinanceEntryAttachment", campo: "uploadedByUser", fk: "uploadedByUserId", tratamento: "desligar" },
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
  { modelo: "PersonalApiToken", campo: "user", fk: "userId", tratamento: "cascata", rotulo: ["token de acesso", "tokens de acesso"] },
  { modelo: "PipelineItemAssignee", campo: "user", fk: "userId", tratamento: "cascata", rotulo: ["atribuição de atividade dos Quadros (a atividade fica, sem ele)", "atribuições de atividade dos Quadros (as atividades ficam, sem ele)"] },
  { modelo: "VagaRecrutador", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "PipelineItemWatcher", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "HandoffSectorAssignee", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "HandoffView", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "MeetingAttendee", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "NotificationHiddenType", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "OAuthAccount", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "PushSubscription", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "UserAgendaConfig", campo: "user", fk: "userId", tratamento: "cascata" },
  // A Agenda da pessoa (10/11/2026): as fontes escondidas e a última visão; sai junto.
  { modelo: "UserAgendaView", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "UserPinnedModule", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "UserPreference", campo: "user", fk: "userId", tratamento: "cascata" },
  // Vínculo da conta GitHub feito em Sua conta (27/10/2026): sai junto com a pessoa.
  { modelo: "GithubAccountLink", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "LocalFiscalScenario", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "UserSector", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "UserTenantAccess", campo: "user", fk: "userId", tratamento: "cascata" },
  // "Todos do setor, menos…" do cofre (10/11/2026): a marca de que ele não vê
  // uma senha não tem o que passar a ninguém — sai junto com a conta.
  { modelo: "BpoCredentialRestriction", campo: "user", fk: "userId", tratamento: "cascata" },
  // Os cartões do topo do Início que a pessoa escolheu (10/11/2026): preferência
  // dela, sem nada para passar a ninguém — sai junto com a conta.
  { modelo: "UserHomeCards", campo: "user", fk: "userId", tratamento: "cascata" },
  // A Academia (10/11/2026): os resultados e as rodadas são da própria pessoa
  // e não do escritório — saem junto com a conta, como as notificações.
  { modelo: "AcademiaResultado", campo: "user", fk: "userId", tratamento: "cascata", rotulo: ["resultado da Academia", "resultados da Academia"] },
  { modelo: "AcademiaSessao", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "AcademiaPreferencia", campo: "user", fk: "userId", tratamento: "cascata" },
  // A Academia, fase 2 (11/11/2026): a meta, o lugar no Hall dos campeões e os
  // parabéns (mandados e recebidos) também são da pessoa — saem com a conta.
  { modelo: "AcademiaMeta", campo: "user", fk: "userId", tratamento: "cascata" },
  { modelo: "AcademiaCampeao", campo: "user", fk: "userId", tratamento: "cascata", rotulo: ["lugar no Hall da Academia", "lugares no Hall da Academia"] },
  { modelo: "AcademiaParabens", campo: "de", fk: "deUserId", tratamento: "cascata" },
  { modelo: "AcademiaParabens", campo: "para", fk: "paraUserId", tratamento: "cascata" },
];

const USUARIO_SOLTAS: ColunaSolta[] = [
  // DP 2 (11/11/2026): quem abriu, fechou, lançou ou importou fica como histórico; a auditoria guarda o nome.
  { modelo: "Dp2TabelaOficial", coluna: "criadaPorId", tratamento: "manter", motivo: "quem gravou a tabela; a auditoria guarda o nome" },
  { modelo: "Dp2Competencia", coluna: "abertaPorId", tratamento: "manter", motivo: "quem abriu a competência; a auditoria guarda o nome" },
  { modelo: "Dp2Competencia", coluna: "fechadaPorId", tratamento: "manter", motivo: "quem fechou a folha; a auditoria guarda o nome" },
  { modelo: "Dp2Evento", coluna: "criadoPorId", tratamento: "manter", motivo: "quem lançou o evento; a auditoria guarda o nome" },
  { modelo: "Dp2Comparativo", coluna: "importadoPorId", tratamento: "manter", motivo: "quem importou os valores da Domínio; a tela não mostra o id" },
  { modelo: "Dp2EventoEsocial", coluna: "geradoPorId", tratamento: "manter", motivo: "quem gerou o evento do eSocial; a auditoria guarda o nome" },
  { modelo: "Dp2Remessa", coluna: "geradaPorId", tratamento: "manter", motivo: "quem gerou o arquivo do banco; a auditoria guarda o nome" },
  { modelo: "Dp2PedidoDeEventos", coluna: "criadoPorId", tratamento: "manter", motivo: "quem pediu os eventos ao cliente; a auditoria guarda o nome" },
  // O Atendimento, o WhatsApp do escritório (10/11/2026): ids de gente sem chave, como no WhatsApp do Recrutamento.
  { modelo: "AtendimentoCiclo", coluna: "assignedToId", tratamento: "manter", motivo: "histórico do atendimento; a tela mostra Alguém da equipe e qualquer pessoa do setor pode assumir" },
  { modelo: "AtendimentoCiclo", coluna: "encerradoPorId", tratamento: "manter", motivo: "histórico do atendimento; a auditoria guarda o nome" },
  { modelo: "AtendimentoMovimento", coluna: "porUserId", tratamento: "manter", motivo: "o caminho da conversa é histórico; a tela mostra só o nome, que some com a pessoa" },
  { modelo: "AtendimentoMovimento", coluna: "paraUserId", tratamento: "manter", motivo: "o caminho da conversa é histórico; a tela mostra só o nome, que some com a pessoa" },
  { modelo: "AtendimentoPedido", coluna: "decididoPorId", tratamento: "manter", motivo: "histórico do pedido; a auditoria guarda o nome" },
  { modelo: "AtendimentoPedido", coluna: "pedidoPorId", tratamento: "manter", motivo: "o pedido de encaminhamento é histórico do atendimento; a tela mostra 'Alguém da equipe' quando a pessoa sai" },
  { modelo: "AtendimentoMensagem", coluna: "senderUserId", tratamento: "manter", motivo: "a assinatura da mensagem guarda o nome como o cliente leu; o id fica só para o histórico" },
  { modelo: "AtendimentoConfig", coluna: "updatedById", tratamento: "manter", motivo: "quem gravou a configuração por último; a tela não mostra o id" },
  { modelo: "DrePublicacao", coluna: "publicadoPorId", tratamento: "manter", motivo: "a publicação guarda o nome de quem publicou (publicadoPorNome), como a auditoria" },
  { modelo: "GithubConnection", coluna: "githubUserId", tratamento: "manter", motivo: "identidade externa do GitHub, sem vínculo com User do Connect" },
  { modelo: "GithubAccountLease", coluna: "githubUserId", tratamento: "manter", motivo: "coordenação por identidade externa do GitHub, não por usuário do Connect" },
  { modelo: "GithubConnection", coluna: "connectedBy", tratamento: "desligar" },
  { modelo: "GithubOAuthAttempt", coluna: "userId", tratamento: "apagar" },
  { modelo: "UserTaskView", coluna: "userId", tratamento: "apagar" },
  { modelo: "RobotTask", coluna: "requestedById", tratamento: "desligar" },
  // A sessão assistida do captcha (06/11/2026): o nome de quem resolveu fica na auditoria.
  { modelo: "RobotAssist", coluna: "lastClickById", tratamento: "manter", motivo: "quem clicou no captcha pelo Connect; a tela não mostra o id, e a auditoria guarda o nome" },
  // XML recusado pelo leitor (06/11/2026): só a contagem dos recusados.
  { modelo: "FiscalXmlRefusal", coluna: "lastSeenById", tratamento: "manter", motivo: "quem enviou o XML recusado por último; a tela não mostra o id" },
  { modelo: "UserTaskView", coluna: "updatedById", tratamento: "manter", motivo: "quem gravou o Meu dia da pessoa por último; a tela não expõe o id" },
  // O Financeiro da 41 (05/11/2026): o nome fica gravado junto do id.
  { modelo: "InventoryItem", coluna: "holderUserId", tratamento: "manter", motivo: "com quem está o item; o nome fica gravado em holderName e a tela mostra o nome" },
  { modelo: "InventoryItem", coluna: "createdById", tratamento: "manter", motivo: "autor do cadastro do item do estoque; a tela não expõe o id" },
  { modelo: "InventoryMovement", coluna: "holderUserId", tratamento: "manter", motivo: "histórico do estoque, com o nome gravado no movimento" },
  { modelo: "InventoryMovement", coluna: "createdById", tratamento: "manter", motivo: "histórico do estoque, com o nome de quem registrou" },
  { modelo: "InternalContract", coluna: "ownerUserId", tratamento: "manter", motivo: "quem responde pelo contrato; o nome fica gravado em ownerName e a tela mostra o nome" },
  { modelo: "InternalContract", coluna: "createdById", tratamento: "manter", motivo: "autor do cadastro do contrato; a tela não expõe o id" },
  { modelo: "SectorMenuOrder", coluna: "updatedById", tratamento: "manter", motivo: "quem organizou o menu do setor por último; a tela não expõe o id" },
  { modelo: "SectorAgendaView", coluna: "updatedById", tratamento: "manter", motivo: "quem mudou a Agenda do setor por último; a tela não expõe o id, e a auditoria guarda o nome" },
  // O padrão dos cartões do Início do setor (10/11/2026): a troca fica na auditoria, com o nome.
  { modelo: "SectorHomeCards", coluna: "updatedById", tratamento: "manter", motivo: "quem gravou por último o padrão dos cartões do Início do setor; a tela não expõe o id e a auditoria guarda o nome" },
  { modelo: "HelpdeskDraft", coluna: "createdById", tratamento: "reatribuir" },
  { modelo: "HelpdeskTicket", coluna: "createdById", tratamento: "reatribuir" },
  { modelo: "HelpdeskAssignee", coluna: "userId", tratamento: "apagar" },
  { modelo: "HelpdeskParticipant", coluna: "userId", tratamento: "apagar" },
  // Última visita ao chamado (número do menu, 06/11/2026): sai com a conta.
  { modelo: "HelpdeskTicketView", coluna: "userId", tratamento: "apagar" },
  { modelo: "HelpdeskAttachment", coluna: "uploadedById", tratamento: "reatribuir" },
  { modelo: "HelpdeskComment", coluna: "authorId", tratamento: "reatribuir" },
  { modelo: "HelpdeskEvent", coluna: "actorId", tratamento: "manter", motivo: "histórico dos eventos de atendimento" },
  { modelo: "PersonalApiToken", coluna: "revokedById", tratamento: "manter", motivo: "quem revogou o token de outra pessoa (o administrador); a tela não expõe o id" },
  { modelo: "TechInternalAttachment", coluna: "uploadedById", tratamento: "manter", motivo: "quem anexou o arquivo no Controle interno; a tela mostra o nome gravado junto, como nos comentários" },
  { modelo: "TechInternalAcceptanceCheck", coluna: "checkedById", tratamento: "manter", motivo: "quem conferiu o ponto do critério de aceite no Controle interno; a tela mostra o nome gravado junto, como nos comentários" },
  // A Academia (10/11/2026): quem cadastrou o texto ou a questão e quem gravou o
  // prêmio do mês. A tela não mostra; a auditoria guarda o nome.
  { modelo: "AcademiaTexto", coluna: "createdById", tratamento: "manter", motivo: "quem cadastrou o texto da Academia; a tela não expõe o id, e a auditoria guarda o nome" },
  { modelo: "AcademiaQuestao", coluna: "createdById", tratamento: "manter", motivo: "quem cadastrou a questão da Academia; a tela não expõe o id, e a auditoria guarda o nome" },
  { modelo: "AcademiaPremio", coluna: "updatedById", tratamento: "manter", motivo: "quem gravou o prêmio do mês da Academia; a tela não expõe o id, e a auditoria guarda o nome" },
  // O Repositório de fluxos (10/11/2026): quem criou, editou, salvou a versão e
  // anexou, e o dono do fluxo. A tela mostra o nome de quem existe (a versão
  // guarda o nome junto); sem a pessoa, mostra “—” e o setor escolhe outro dono.
  { modelo: "FlowFolder", coluna: "createdById", tratamento: "manter", motivo: "quem criou a pasta do Repositório de fluxos; a tela não expõe o id, e a auditoria guarda o nome" },
  { modelo: "FlowDoc", coluna: "createdById", tratamento: "manter", motivo: "quem criou o fluxo; a tela não expõe o id, e a auditoria guarda o nome" },
  { modelo: "FlowDoc", coluna: "updatedById", tratamento: "manter", motivo: "quem salvou a última versão do fluxo; a tela não expõe o id, e a versão guarda o nome" },
  { modelo: "FlowDoc", coluna: "ownerUserId", tratamento: "manter", motivo: "o dono do fluxo; a tela mostra o nome de quem existe, e sem a pessoa mostra “—” até o setor escolher outro" },
  { modelo: "FlowVersion", coluna: "savedById", tratamento: "manter", motivo: "quem salvou a versão do fluxo; o nome fica gravado em savedByName e a tela mostra o nome" },
  { modelo: "FlowAttachment", coluna: "uploadedById", tratamento: "manter", motivo: "quem anexou o arquivo ao fluxo; a tela não expõe o id, e a auditoria guarda o nome" },
  { modelo: "DominioAccountMap", coluna: "updatedById", tratamento: "manter", motivo: "quem mexeu no de-para da Domínio; a tela não expõe o id" },
  { modelo: "DominioExportacao", coluna: "createdById", tratamento: "manter", motivo: "quem baixou a planilha da Domínio; a tela mostra o nome, e sem a pessoa mostra “—”" },
  { modelo: "ContabilRegra", coluna: "updatedById", tratamento: "manter", motivo: "quem gravou a regra do de-para contábil; a tela não expõe o id" },
  { modelo: "ContabilModelo", coluna: "updatedById", tratamento: "manter", motivo: "quem mexeu nas contas fixas ou carregou o plano; a tela não expõe o id" },
  { modelo: "ContabilCfopConta", coluna: "updatedById", tratamento: "manter", motivo: "autor da sugestão contábil de CFOP" },
  { modelo: "ContabilDocumentoPagamento", coluna: "enviadoPorId", tratamento: "manter", motivo: "quem enviou o documento de pagamentos sem nota" },
  { modelo: "ContabilPagamento", coluna: "corrigidoPorId", tratamento: "manter", motivo: "quem corrigiu a leitura do pagamento sem nota" },
  { modelo: "ContabilPagamento", coluna: "decididoPorId", tratamento: "manter", motivo: "quem aceitou ou descartou o pagamento sem nota" },
  { modelo: "ContabilPagamentoCategoria", coluna: "updatedById", tratamento: "manter", motivo: "autor da regra da categoria de pagamento" },
  { modelo: "ContabilPagamentoNome", coluna: "updatedById", tratamento: "manter", motivo: "quem confirmou a conta do fornecedor sem CPF/CNPJ" },
  { modelo: "ContabilContaPagamento", coluna: "updatedById", tratamento: "manter", motivo: "quem gravou as contas dos pagamentos sem nota" },
  { modelo: "ContabilContaSaida", coluna: "updatedById", tratamento: "manter", motivo: "quem gravou as contas das saídas" },
  { modelo: "Guia", coluna: "pagaPorId", tratamento: "manter", motivo: "quem marcou a guia como paga; a tela não expõe o id" },
  { modelo: "SectorQuadrosBloqueados", coluna: "createdById", tratamento: "manter", motivo: "quem bloqueou os Quadros do setor; a tela não expõe o id, e a auditoria guarda o nome" },
  { modelo: "Guia", coluna: "emitidaPorId", tratamento: "manter", motivo: "quem emitiu a guia; a tela não expõe o id" },
  { modelo: "Certidao", coluna: "pedidaPorId", tratamento: "manter", motivo: "quem pediu a certidão; a tela não expõe o id" },
  { modelo: "Certidao", coluna: "vistaPorId", tratamento: "manter", motivo: "quem viu a positiva; a tela não expõe o id" },
  { modelo: "BankReconciliationRule", coluna: "createdById", tratamento: "manter", motivo: "quem criou a regra; a tela não expõe o id" },
  { modelo: "FinanceRecurrence", coluna: "createdById", tratamento: "manter", motivo: "quem lançou a série; as contas que o agendador cria levam esse nome" },
  { modelo: "BankRuleApplication", coluna: "createdById", tratamento: "manter", motivo: "registro de quem lançou pela regra" },
  { modelo: "BankRuleApplication", coluna: "undoneById", tratamento: "manter", motivo: "registro de quem desfez o lançamento da regra" },
  { modelo: "HelpdeskChecklistItem", coluna: "doneById", tratamento: "manter", motivo: "trilha de quem conferiu o item; a tela não expõe o id" },
  { modelo: "HelpdeskApproval", coluna: "decidedById", tratamento: "manter", motivo: "histórico da decisão de aprovação" },
  { modelo: "HelpdeskReopenRequest", coluna: "requestedById", tratamento: "manter", motivo: "histórico do pedido de reabertura" },
  { modelo: "HelpdeskReopenRequest", coluna: "decidedById", tratamento: "manter", motivo: "histórico da decisão de reabertura" },
  // Sessão e troca de senha: saem com a conta.
  { modelo: "RefreshToken", coluna: "userId", tratamento: "apagar" },
  { modelo: "PasswordResetToken", coluna: "userId", tratamento: "apagar" },
  // Preferência "última empresa aberta": sai com a conta.
  { modelo: "UserLastCompany", coluna: "userId", tratamento: "apagar" },
  // O tutorial do primeiro acesso já visto: sai com a conta. A mesma coluna
  // guarda o id de acessos do portal (subject PORTAL_USER) — esses saem com o
  // acesso (`excluirAcessoDoPortal`).
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
  { modelo: "DigitalCertificate", coluna: "renovacaoResponsavelId", tratamento: "desligar" },
  // Trilhas que guardam o id de quem fez e não mostram o nome.
  { modelo: "Notification", coluna: "actorUserId", tratamento: "manter", motivo: "a notificação já foi entregue; o texto leva o nome" },
  { modelo: "AgentRun", coluna: "userId", tratamento: "manter", motivo: "trilha de execução da IA" },
  { modelo: "SerproCall", coluna: "userId", tratamento: "manter", motivo: "trilha de consultas ao Serpro (cobradas por chamada)" },
  { modelo: "DigitalCertificateUse", coluna: "declaradoPorId", tratamento: "manter", motivo: "quem marcou o uso do certificado; a tela não expõe o id" },
  { modelo: "RevisaoFechamento", coluna: "criadoPorId", tratamento: "manter", motivo: "quem abriu o fechamento em revisão; a tela não mostra" },
  { modelo: "RevisaoDocumento", coluna: "enviadoPorId", tratamento: "manter", motivo: "quem enviou o documento à revisão; a tela não mostra" },
  { modelo: "RevisaoExecucao", coluna: "executadaPorId", tratamento: "manter", motivo: "quem executou a análise; a tela mostra o nome só enquanto o usuário existe" },
  { modelo: "RevisaoAcompanhamento", coluna: "atualizadoPorId", tratamento: "manter", motivo: "quem atualizou o acompanhamento do achado; a tela não mostra" },
  // Contábil Core (09/11/2026): trilhas de quem fez, vindas também da carga do sistema antigo.
  { modelo: "CoreContraparte", coluna: "confirmadoPorId", tratamento: "manter", motivo: "quem confirmou o cadastro da contraparte; trilha contábil" },
  { modelo: "CoreImportacao", coluna: "criadoPorId", tratamento: "manter", motivo: "quem enviou o extrato; trilha contábil" },
  { modelo: "CoreImportacao", coluna: "canceladaPorId", tratamento: "manter", motivo: "quem desfez a importação; trilha contábil" },
  { modelo: "CoreTransacao", coluna: "autoRecusadoPorId", tratamento: "manter", motivo: "quem recusou a classificação automática; trilha contábil" },
  { modelo: "CoreRegistro", coluna: "canceladoPorId", tratamento: "manter", motivo: "quem cancelou o lançamento; trilha contábil" },
  { modelo: "CoreExportacao", coluna: "criadoPorId", tratamento: "manter", motivo: "quem gerou o arquivo de exportação; trilha contábil" },
  { modelo: "SerproMensagem", coluna: "abertaPorId", tratamento: "manter", motivo: "quem abriu a mensagem deu ciência da intimação" },
  { modelo: "SerproPedido", coluna: "pedidoPorId", tratamento: "desligar" },
  { modelo: "SerproTermo", coluna: "enviadoPorId", tratamento: "desligar" },
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
