// Exclusão de empresa.
//
// A ordem de apagar herda o que `limparDemo` (scripts/dados-de-demonstracao.ts)
// aprendeu na empresa [demo] do BPO, e cobre o resto das tabelas que apontam
// para a empresa. `plano.test.ts` confere a ordem contra as chaves do schema.
//
// Teto de segurança: com mais de LIMITE_DE_NOTAS notas fiscais a empresa não
// sai por aqui. Produção tem cliente com ~250 mil notas (dado real, não
// teste), e apagar isso numa transação seguraria o banco por minutos.

import type { PrismaClient } from "@/generated/prisma/client";
import { nomeExibicao } from "@/lib/companyName";
import { formatDocumento, formatarNumero } from "@/lib/format";
import {
  OPCOES_DA_TRANSACAO,
  Recusa,
  compactar,
  contarLigacoes,
  executarPlano,
  item,
  itensDasContagens,
  juntos,
  mensagemDeErro,
  n,
  nomeDoAtor,
  papelExclui,
  registrarExclusao,
  validarModo,
  type Passo,
  type Tx,
} from "./comum";
import { SO_ADMIN_EXCLUI } from "@/lib/auth/papeis";
import { anotar, apagarArquivos, curriculosSemUso, juntarArquivos, semArquivos, totalDeArquivos, type ArquivosDoCadastro } from "./arquivos";
import { PLANO_DA_PESSOA, arquivosDasPessoas, itensDasPessoas } from "./pessoa";
import { LIGACOES, contagem } from "./registro";
import type { ModoDaExclusao, Previa, ResultadoDaExclusao, ResultadoEmMassa } from "./tipos";

/** Acima disto a empresa é histórico de verdade, não teste — não sai por aqui. */
export const LIMITE_DE_NOTAS = 2000;

/** Exclusão em massa: quantas empresas por pedido. */
export const LIMITE_EM_MASSA = 100;

export type AlvoEmpresa = { tenantId: string; id: string };

const daEmpresa = (a: AlvoEmpresa) => ({ tenantId: a.tenantId, companyId: a.id });
const daEntidade = (a: AlvoEmpresa) => ({ tenantId: a.tenantId, entityType: "COMPANY" as const, entityId: a.id });

/** As candidaturas às vagas da empresa — saem com ela; o candidato fica. */
async function candidaturasDaEmpresa(tx: Tx, a: AlvoEmpresa): Promise<string[]> {
  return (
    await tx.candidatura.findMany({ where: { tenantId: a.tenantId, vaga: { companyId: a.id } }, select: { id: true } })
  ).map((c) => c.id);
}

async function vagasDaEmpresa(tx: Tx, a: AlvoEmpresa): Promise<string[]> {
  return (await tx.vaga.findMany({ where: daEmpresa(a), select: { id: true } })).map((v) => v.id);
}

/** Os documentos da ficha da empresa e os anexos das vagas dela. */
function documentosDaEmpresa(a: AlvoEmpresa, vagas: string[]) {
  return {
    tenantId: a.tenantId,
    OR: [
      { entityType: "COMPANY" as const, entityId: a.id },
      ...(vagas.length > 0 ? [{ entityType: "VAGA" as const, entityId: { in: vagas } }] : []),
    ],
  };
}

async function acordosDaEmpresa(tx: Tx, a: AlvoEmpresa): Promise<string[]> {
  return (await tx.collectionAgreement.findMany({ where: daEmpresa(a), select: { id: true } })).map((c) => c.id);
}

export const PLANO_DA_EMPRESA: readonly Passo<AlvoEmpresa>[] = [
  // Recrutamento: as candidaturas das vagas (com notas, avaliações e reuniões,
  // em cascata), depois as vagas. O candidato continua no banco de talentos.
  {
    modelo: "WhatsappThread",
    acao: "anular",
    coluna: "candidaturaId",
    executar: async (tx, a) => {
      const ids = await candidaturasDaEmpresa(tx, a);
      if (ids.length === 0) return 0;
      return n(tx.whatsappThread.updateMany({ where: { tenantId: a.tenantId, candidaturaId: { in: ids } }, data: { candidaturaId: null } }));
    },
  },
  // O teste enviado para a candidatura fica com o candidato, sem a candidatura.
  // Depois da migration 20261014200000 o banco faria isso sozinho (SET NULL);
  // antes dela a chave é RESTRICT e travava a exclusão da candidatura.
  {
    modelo: "AssessmentLink",
    acao: "anular",
    coluna: "candidaturaId",
    executar: async (tx, a) => {
      const ids = await candidaturasDaEmpresa(tx, a);
      if (ids.length === 0) return 0;
      return n(tx.assessmentLink.updateMany({ where: { tenantId: a.tenantId, candidaturaId: { in: ids } }, data: { candidaturaId: null } }));
    },
  },
  {
    modelo: "Candidatura",
    acao: "apagar",
    executar: (tx, a) => n(tx.candidatura.deleteMany({ where: { tenantId: a.tenantId, vaga: { companyId: a.id } } })),
  },
  // Os anexos da vaga (Document com entityType VAGA) — sem chave, ficariam soltos.
  {
    modelo: "Document",
    acao: "apagar",
    executar: async (tx, a) => {
      const vagas = await vagasDaEmpresa(tx, a);
      if (vagas.length === 0) return 0;
      return n(tx.document.deleteMany({ where: { tenantId: a.tenantId, entityType: "VAGA", entityId: { in: vagas } } }));
    },
  },
  { modelo: "Vaga", acao: "apagar", executar: (tx, a) => n(tx.vaga.deleteMany({ where: daEmpresa(a) })) },

  // Documentos enviados ao cliente: quem viu, para quem foi, o documento.
  {
    modelo: "ClientDocumentView",
    acao: "apagar",
    executar: (tx, a) => n(tx.clientDocumentView.deleteMany({ where: { recipient: { clientDocument: daEmpresa(a) } } })),
  },
  {
    modelo: "ClientDocumentRecipient",
    acao: "apagar",
    executar: (tx, a) => n(tx.clientDocumentRecipient.deleteMany({ where: { clientDocument: daEmpresa(a) } })),
  },
  { modelo: "ClientDocument", acao: "apagar", executar: (tx, a) => n(tx.clientDocument.deleteMany({ where: daEmpresa(a) })) },

  // Conciliação: os vínculos, as transações do extrato, as importações.
  {
    modelo: "BankTransactionMatch",
    acao: "apagar",
    executar: (tx, a) =>
      n(
        tx.bankTransactionMatch.deleteMany({
          where: { OR: [{ transaction: { bankAccount: daEmpresa(a) } }, { financeEntry: daEmpresa(a) }] },
        })
      ),
  },
  {
    modelo: "BankTransaction",
    acao: "apagar",
    executar: (tx, a) => n(tx.bankTransaction.deleteMany({ where: { tenantId: a.tenantId, bankAccount: { companyId: a.id } } })),
  },
  {
    modelo: "BankStatementImport",
    acao: "apagar",
    executar: (tx, a) => n(tx.bankStatementImport.deleteMany({ where: { tenantId: a.tenantId, bankAccount: { companyId: a.id } } })),
  },

  // Cobrança: o lançamento solta o acordo (RESTRICT dos dois lados), o acordo
  // sai, o lançamento sai — eventos, contatos e lembretes vão em cascata.
  //
  // Os ids dos acordos vêm antes, e o UPDATE filtra por eles: um UPDATE com
  // filtro de relação na própria tabela é o caso que o MySQL recusa (erro 1093).
  {
    modelo: "FinanceEntry",
    acao: "anular",
    coluna: "agreementId",
    executar: async (tx, a) => {
      const acordos = await acordosDaEmpresa(tx, a);
      if (acordos.length === 0) return 0;
      return n(tx.financeEntry.updateMany({ where: { tenantId: a.tenantId, agreementId: { in: acordos } }, data: { agreementId: null } }));
    },
  },
  {
    modelo: "FinanceEntry",
    acao: "anular",
    coluna: "renegotiatedAgreementId",
    executar: async (tx, a) => {
      const acordos = await acordosDaEmpresa(tx, a);
      if (acordos.length === 0) return 0;
      return n(
        tx.financeEntry.updateMany({
          where: { tenantId: a.tenantId, renegotiatedAgreementId: { in: acordos } },
          data: { renegotiatedAgreementId: null },
        })
      );
    },
  },
  { modelo: "CollectionAgreement", acao: "apagar", executar: (tx, a) => n(tx.collectionAgreement.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "FinanceEntry", acao: "apagar", executar: (tx, a) => n(tx.financeEntry.deleteMany({ where: daEmpresa(a) })) },
  {
    modelo: "CollectionReminderOptOut",
    acao: "apagar",
    executar: (tx, a) => n(tx.collectionReminderOptOut.deleteMany({ where: daEmpresa(a) })),
  },
  { modelo: "FinanceCounterparty", acao: "apagar", executar: (tx, a) => n(tx.financeCounterparty.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "PortalApprovalLimit", acao: "apagar", executar: (tx, a) => n(tx.portalApprovalLimit.deleteMany({ where: daEmpresa(a) })) },
  // As linhas do orçamento vão em cascata.
  { modelo: "Budget", acao: "apagar", executar: (tx, a) => n(tx.budget.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "CostCenter", acao: "apagar", executar: (tx, a) => n(tx.costCenter.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "FinanceProject", acao: "apagar", executar: (tx, a) => n(tx.financeProject.deleteMany({ where: daEmpresa(a) })) },
  // Plano de contas próprio: o que a empresa escondeu, o que ela classificou
  // na DRE, e o que outra empresa tenha feito com uma categoria desta.
  {
    modelo: "FinanceCategoryHidden",
    acao: "apagar",
    executar: (tx, a) =>
      n(
        tx.financeCategoryHidden.deleteMany({
          where: { tenantId: a.tenantId, OR: [{ companyId: a.id }, { category: { companyId: a.id } }] },
        })
      ),
  },
  {
    modelo: "DreCategoryMapping",
    acao: "apagar",
    executar: (tx, a) =>
      n(
        tx.dreCategoryMapping.deleteMany({
          where: { tenantId: a.tenantId, OR: [{ companyId: a.id }, { category: { companyId: a.id } }] },
        })
      ),
  },
  { modelo: "FinanceCategory", acao: "apagar", executar: (tx, a) => n(tx.financeCategory.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "BankAccount", acao: "apagar", executar: (tx, a) => n(tx.bankAccount.deleteMany({ where: daEmpresa(a) })) },

  // Conversa com o cliente — mensagens, anexos e lembretes vão em cascata.
  { modelo: "ClientRequest", acao: "apagar", executar: (tx, a) => n(tx.clientRequest.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "CompanyMessage", acao: "apagar", executar: (tx, a) => n(tx.companyMessage.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "ServiceRequest", acao: "apagar", executar: (tx, a) => n(tx.serviceRequest.deleteMany({ where: daEmpresa(a) })) },

  // Societário — etapas, protocolos, conversa, documentos e horas vão em cascata.
  { modelo: "ProcessFee", acao: "apagar", executar: (tx, a) => n(tx.processFee.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "Process", acao: "apagar", executar: (tx, a) => n(tx.process.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "License", acao: "apagar", executar: (tx, a) => n(tx.license.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "RecurringObligation", acao: "apagar", executar: (tx, a) => n(tx.recurringObligation.deleteMany({ where: daEmpresa(a) })) },

  // Fiscal e DRE.
  { modelo: "OmieEmissao", acao: "apagar", executar: (tx, a) => n(tx.omieEmissao.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "FiscalDocument", acao: "apagar", executar: (tx, a) => n(tx.fiscalDocument.deleteMany({ where: daEmpresa(a) })) },
  { modelo: "DreImport", acao: "apagar", executar: (tx, a) => n(tx.dreImport.deleteMany({ where: daEmpresa(a) })) },

  // DP: a folha (as linhas vão em cascata) e os benefícios atribuídos a
  // funcionários, que travariam a cascata do catálogo de benefícios.
  { modelo: "PayrollCompetency", acao: "apagar", executar: (tx, a) => n(tx.payrollCompetency.deleteMany({ where: daEmpresa(a) })) },
  {
    modelo: "BenefitAssignment",
    acao: "apagar",
    executar: (tx, a) => n(tx.benefitAssignment.deleteMany({ where: { tenantId: a.tenantId, benefit: { companyId: a.id } } })),
  },

  // Senhas do cofre: saem, em vez de ficarem soltas sem empresa (o banco
  // anularia o vínculo e deixaria a senha). Quem viu vai em cascata.
  { modelo: "BpoCredential", acao: "apagar", executar: (tx, a) => n(tx.bpoCredential.deleteMany({ where: daEmpresa(a) })) },

  // Referências sem chave estrangeira.
  { modelo: "Document", acao: "apagar", executar: (tx, a) => n(tx.document.deleteMany({ where: daEntidade(a) })) },
  { modelo: "Handoff", acao: "apagar", executar: (tx, a) => n(tx.handoff.deleteMany({ where: daEntidade(a) })) },
  { modelo: "Notification", acao: "apagar", executar: (tx, a) => n(tx.notification.deleteMany({ where: daEntidade(a) })) },
  {
    modelo: "CustomValue",
    acao: "apagar",
    executar: (tx, a) => n(tx.customValue.deleteMany({ where: { tenantId: a.tenantId, entityId: a.id } })),
  },
  // "Última empresa aberta" de quem abriu esta empresa: a preferência some com ela.
  {
    modelo: "UserLastCompany",
    acao: "apagar",
    executar: (tx, a) => n(tx.userLastCompany.deleteMany({ where: { tenantId: a.tenantId, companyId: a.id } })),
  },
  {
    modelo: "PipelineItem",
    acao: "anular",
    coluna: "entityId",
    executar: (tx, a) =>
      n(tx.pipelineItem.updateMany({ where: daEntidade(a), data: { entityType: null, entityId: null } })),
  },
  {
    modelo: "ValoraProposta",
    acao: "anular",
    coluna: "companyId",
    executar: (tx, a) => n(tx.valoraProposta.updateMany({ where: daEmpresa(a), data: { companyId: null } })),
  },

  // Setores contratados, departamentos, cargos, turnos, catálogo de benefícios,
  // sócios, configuração de rescisão e pastas de Arquivos vão em cascata;
  // filiais, funcionários, reuniões e certificados ficam, sem a empresa.
  { modelo: "Company", acao: "apagar", executar: (tx, a) => n(tx.company.deleteMany({ where: { tenantId: a.tenantId, id: a.id } })) },
];

/** Os arquivos em disco da empresa. Rodar dentro da transação, antes de apagar. */
export async function arquivosDaEmpresa(tx: Tx, a: AlvoEmpresa, logoUrl: string | null): Promise<ArquivosDoCadastro> {
  const arquivos = semArquivos();
  const vagas = await vagasDaEmpresa(tx, a);
  const [documentos, enviados, pendencias, mensagens, solicitacoes, processos, guias, drive, candidaturas] = await juntos(tx, [
    () => tx.document.findMany({ where: documentosDaEmpresa(a, vagas), select: { fileUrl: true } }),
    () => tx.clientDocument.findMany({ where: daEmpresa(a), select: { fileUrl: true } }),
    () => tx.clientRequestAttachment.findMany({ where: { request: daEmpresa(a) }, select: { fileUrl: true } }),
    () => tx.companyMessageAttachment.findMany({ where: { tenantId: a.tenantId, message: { companyId: a.id } }, select: { fileUrl: true } }),
    () => tx.serviceRequestAttachment.findMany({ where: { request: daEmpresa(a) }, select: { fileUrl: true } }),
    () => tx.processDocument.findMany({ where: { tenantId: a.tenantId, process: { companyId: a.id } }, select: { fileUrl: true } }),
    () => tx.processFee.findMany({
      where: { tenantId: a.tenantId, documentUrl: { not: null }, OR: [{ companyId: a.id }, { process: { companyId: a.id } }] },
      select: { documentUrl: true },
    }),
    () => tx.driveFile.findMany({ where: { tenantId: a.tenantId, folder: { companyId: a.id } }, select: { storageKey: true } }),
    () => tx.candidatura.findMany({ where: { tenantId: a.tenantId, vaga: { companyId: a.id }, resumeUrl: { not: null } }, select: { resumeUrl: true } }),
  ]);
  anotar(arquivos, "documents", documentos.map((d) => d.fileUrl));
  anotar(arquivos, "client-documents", enviados.map((d) => d.fileUrl));
  anotar(arquivos, "client-requests", pendencias.map((d) => d.fileUrl));
  anotar(arquivos, "company-messages", mensagens.map((d) => d.fileUrl));
  anotar(arquivos, "service-requests", solicitacoes.map((d) => d.fileUrl));
  anotar(arquivos, "societario-processos", processos.map((d) => d.fileUrl));
  anotar(arquivos, "drive", drive.map((d) => d.storageKey));
  for (const g of guias) if (g.documentUrl) arquivos.guias.push({ tenantId: a.tenantId, documentUrl: g.documentUrl });
  arquivos.curriculos.push(...candidaturas.map((c) => c.resumeUrl).filter((u): u is string => !!u));
  if (logoUrl) arquivos.publicos.push({ pasta: "companies", url: logoUrl });
  return arquivos;
}

type EmpresaDaPrevia = {
  id: string;
  name: string;
  displayName: string | null;
  kind: "PESSOA_JURIDICA" | "PESSOA_FISICA";
  cnpj: string | null;
  cpf: string | null;
  logoUrl: string | null;
};

const SELECAO = { id: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true, logoUrl: true } as const;

/** Funcionários de empresa cliente desta empresa — a equipe do escritório nunca entra. */
async function funcionariosDaEmpresa(db: Tx, tenantId: string, id: string) {
  return db.person.findMany({
    where: { tenantId, currentCompanyId: id, type: "COLABORADOR", isInternal: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function previaDe(db: Tx, tenantId: string, e: EmpresaDaPrevia): Promise<Previa> {
  const a = { tenantId, id: e.id };
  const vagas = await vagasDaEmpresa(db, a);
  const [contagens, candidaturas, transacoes, documentos, arquivos, beneficios, transferencias, tarefas, propostas, funcionarios] =
    await juntos(db, [
      () => contarLigacoes(db, LIGACOES.Company, e.id),
      () => db.candidatura.count({ where: { tenantId, vaga: { companyId: e.id } } }),
      () => db.bankTransaction.count({ where: { tenantId, bankAccount: { companyId: e.id } } }),
      () => db.document.count({ where: documentosDaEmpresa(a, vagas) }),
      () => db.driveFile.count({ where: { tenantId, folder: { companyId: e.id } } }),
      () => db.benefitAssignment.count({ where: { tenantId, benefit: { companyId: e.id } } }),
      () => db.handoff.count({ where: daEntidade(a) }),
      () => db.pipelineItem.count({ where: daEntidade(a) }),
      () => db.valoraProposta.count({ where: daEmpresa(a) }),
      () => funcionariosDaEmpresa(db, tenantId, e.id),
  ]);

  const itens = [
    ...itensDasContagens(contagens),
    ...compactar([
      item("Candidatura.vaga", candidaturas, ["candidatura nas vagas", "candidaturas nas vagas"], "apagar", true),
      item("BankTransaction.bankAccount", transacoes, ["transação de extrato bancário", "transações de extrato bancário"], "apagar", true),
      item("Document.entityId", documentos, ["documento da ficha ou das vagas", "documentos da ficha e das vagas"], "apagar", true),
      item("DriveFile.folder", arquivos, ["arquivo em Arquivos", "arquivos em Arquivos"], "apagar", true),
      item("BenefitAssignment.benefit", beneficios, ["benefício atribuído a funcionário", "benefícios atribuídos a funcionários"], "apagar", true),
      item("Handoff.entityId", transferencias, ["transferência entre setores", "transferências entre setores"], "apagar", true),
      item("PipelineItem.entityId", tarefas, ["tarefa do Kanban (fica, sem a empresa)", "tarefas do Kanban (ficam, sem a empresa)"], "desligar"),
      item("ValoraProposta.companyId", propostas, ["proposta do Valora (fica, sem a empresa)", "propostas do Valora (ficam, sem a empresa)"], "desligar"),
    ]),
  ];

  const notas = contagens.find((c) => c.ligacao.modelo === "FiscalDocument")?.quantidade ?? 0;
  const bloqueio =
    notas > LIMITE_DE_NOTAS
      ? `Esta empresa tem ${contagem(notas, ["nota fiscal", "notas fiscais"])}. É histórico demais para apagar por aqui (o limite é ${formatarNumero(LIMITE_DE_NOTAS, 0)} notas) — para tirá-la das listas, inative o cadastro.`
      : null;

  let opcao: Previa["opcao"] = null;
  if (funcionarios.length > 0) {
    const itensDosFuncionarios = await itensDasPessoas(db, tenantId, funcionarios.map((f) => f.id));
    opcao = {
      rotulo:
        funcionarios.length === 1
          ? `Excluir também ${funcionarios[0].name}, funcionário desta empresa`
          : `Excluir também os ${formatarNumero(funcionarios.length, 0)} funcionários desta empresa`,
      ajuda: "Sem marcar, eles continuam em Colaboradores de clientes, sem empresa.",
      trazHistorico: itensDosFuncionarios.some((i) => i.historico),
      itens: itensDosFuncionarios,
    };
  }

  const documento = e.cnpj || e.cpf ? formatDocumento(e.kind, e.cnpj, e.cpf) : null;
  return {
    tipo: "empresa",
    id: e.id,
    nome: nomeExibicao(e),
    detalhe: documento ? `${e.kind === "PESSOA_FISICA" ? "CPF" : "CNPJ"} ${documento}` : null,
    itens,
    temHistorico: itens.some((i) => i.historico),
    bloqueio,
    avisos: [],
    opcao,
    rotuloDoModoCompleto: "Excluir com tudo o que está ligado",
  };
}

export async function previaDaEmpresa(db: Tx, tenantId: string, id: string): Promise<Previa | null> {
  const e = await db.company.findFirst({ where: { id, tenantId }, select: SELECAO });
  return e ? previaDe(db, tenantId, e) : null;
}

export type PedidoDaEmpresa = {
  tenantId: string;
  ator: { id: string; role: string };
  id: string;
  modo: ModoDaExclusao;
  confirmacao?: string;
  incluirFuncionarios?: boolean;
};

/**
 * Exclui a empresa. Confere tudo de novo dentro da transação — papel, tenant,
 * teto de notas, histórico e o nome digitado —, apaga na ordem do plano (os
 * funcionários antes, se pedido), grava o registro e, depois do commit, tira
 * os arquivos do disco.
 */
export async function excluirEmpresaDeVez(prisma: PrismaClient, pedido: PedidoDaEmpresa): Promise<ResultadoDaExclusao> {
  if (!pedido.tenantId || !papelExclui(pedido.ator.role)) return { ok: false, erro: SO_ADMIN_EXCLUI };

  let arquivos: ArquivosDoCadastro = semArquivos();
  let saida: { nome: string; resumo: string[] };
  try {
    saida = await prisma.$transaction(async (tx) => {
      const e = await tx.company.findFirst({ where: { id: pedido.id, tenantId: pedido.tenantId }, select: SELECAO });
      if (!e) throw new Recusa("Empresa não encontrada.");
      const previa = await previaDe(tx, pedido.tenantId, e);
      const comFuncionarios = !!pedido.incluirFuncionarios && !!previa.opcao;
      validarModo(previa, pedido.modo, pedido.confirmacao, comFuncionarios && !!previa.opcao?.trazHistorico);

      const alvo = { tenantId: pedido.tenantId, id: e.id };
      arquivos = await arquivosDaEmpresa(tx, alvo, e.logoUrl);
      let mexidoNosFuncionarios: Record<string, number> = {};
      let funcionarios: { id: string; name: string }[] = [];
      if (comFuncionarios) {
        funcionarios = await funcionariosDaEmpresa(tx, pedido.tenantId, e.id);
        const daLista = { tenantId: pedido.tenantId, ids: funcionarios.map((f) => f.id) };
        arquivos = juntarArquivos(arquivos, await arquivosDasPessoas(tx, daLista));
        mexidoNosFuncionarios = await executarPlano(tx, PLANO_DA_PESSOA, daLista);
      }
      const mexido = await executarPlano(tx, PLANO_DA_EMPRESA, alvo);

      const resumo = [
        ...previa.itens.filter((i) => i.efeito !== "desligar").map((i) => i.texto),
        ...(comFuncionarios ? [contagem(funcionarios.length, ["funcionário", "funcionários"])] : []),
      ];
      await registrarExclusao(tx, {
        tenantId: pedido.tenantId,
        ator: { id: pedido.ator.id, nome: await nomeDoAtor(tx, pedido.ator.id) },
        acao: "company.delete",
        entityType: "Company",
        entityId: e.id,
        metadata: {
          nome: e.name,
          ...(e.displayName ? { nomeDeExibicao: e.displayName } : {}),
          documento: e.cnpj ?? e.cpf,
          modo: pedido.modo,
          removido: resumo.join(" · ") || "nada ligado",
          arquivos: totalDeArquivos(arquivos),
          contagens: mexido,
          ...(comFuncionarios
            ? { funcionarios: funcionarios.map((f) => ({ id: f.id, nome: f.name })), contagensDosFuncionarios: mexidoNosFuncionarios }
            : {}),
        },
      });
      return { nome: previa.nome, resumo };
    }, OPCOES_DA_TRANSACAO);
  } catch (err) {
    return { ok: false, erro: mensagemDeErro(err, "empresa") };
  }

  arquivos.curriculos = await curriculosSemUso(prisma, arquivos.curriculos);
  const arquivosNaoApagados = await apagarArquivos(arquivos);
  return { ok: true, ...saida, arquivosNaoApagados, destino: "/empresas" };
}

/** "312 notas fiscais, 4 vagas e mais 3 tipos de registro". */
function resumoDoHistorico(previa: Previa): string {
  const historico = previa.itens.filter((i) => i.historico);
  const primeiros = historico.slice(0, 2).map((i) => i.texto);
  const resto = historico.length - primeiros.length;
  return resto > 0 ? `${primeiros.join(", ")} e mais ${contagem(resto, ["tipo de registro", "tipos de registro"])}` : primeiros.join(" e ");
}

/**
 * Exclusão em massa: só o modo simples. Empresa sem histórico sai; empresa com
 * histórico fica, e a tela diz por quê — digitar o nome de dezenas de empresas
 * de uma vez não confirmaria nada, então o modo com tudo é só pela ficha.
 * Uma por uma, cada qual na sua transação: uma recusa não segura as outras.
 */
export async function excluirEmpresasEmMassa(
  prisma: PrismaClient,
  pedido: { tenantId: string; ator: { id: string; role: string }; ids: string[] }
): Promise<ResultadoEmMassa | { erro: string }> {
  if (!pedido.tenantId || !papelExclui(pedido.ator.role)) return { erro: SO_ADMIN_EXCLUI };
  const ids = [...new Set(pedido.ids.filter((id) => typeof id === "string" && id))];
  if (ids.length === 0) return { excluidas: [], recusadas: [] };
  if (ids.length > LIMITE_EM_MASSA) return { erro: `Selecione no máximo ${LIMITE_EM_MASSA} empresas por vez.` };

  const resultado: ResultadoEmMassa = { excluidas: [], recusadas: [] };
  for (const id of ids) {
    const previa = await previaDaEmpresa(prisma, pedido.tenantId, id);
    if (!previa) {
      resultado.recusadas.push({ id, nome: "Empresa", motivo: "não encontrada neste escritório" });
      continue;
    }
    if (previa.bloqueio || previa.temHistorico) {
      resultado.recusadas.push({
        id,
        nome: previa.nome,
        motivo: `tem histórico (${resumoDoHistorico(previa)}) — para excluir com tudo, abra a ficha da empresa`,
      });
      continue;
    }
    const r = await excluirEmpresaDeVez(prisma, { tenantId: pedido.tenantId, ator: pedido.ator, id, modo: "simples" });
    if (r.ok) resultado.excluidas.push({ id, nome: r.nome });
    else resultado.recusadas.push({ id, nome: previa.nome, motivo: r.erro });
  }
  return resultado;
}
