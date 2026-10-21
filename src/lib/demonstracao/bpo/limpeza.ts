// A limpeza da demonstração do BPO (ver `plano.ts`) — roda dentro da transação
// de `scripts/dados-de-demonstracao.ts --limpar`, depois da do Recrutamento e
// antes de as empresas "[demo]" saírem.
//
// O que sai, e como cada coisa é reconhecida:
// - **as empresas "[demo]"** (menos as do Recrutamento, que a limpeza dele já
//   tratou), com tudo o que estiver ligado a elas, pelo plano da exclusão de
//   empresa do Connect: lançamentos, extratos, pedidos, solicitações, senhas,
//   orçamento, NFS-e — e o que alguém tenha criado nelas durante a
//   apresentação. Antes, as reuniões delas: a exclusão de empresa só as
//   desliga, e aqui elas saem;
// - **o quadro "[demo]" do BPO**: os cards (com subtarefas, comentários, horas e
//   reuniões, em cascata), as listas, as pastas e o espaço;
// - etiquetas, manual, comunicado, pastas internas dos Arquivos e assunto de
//   solicitação com o prefixo "[demo]";
// - a integração do Omie das empresas da demonstração;
// - as notificações cuja mensagem começa com "[demo]".
//
// Quem apaga as empresas em si e o acesso do portal continua sendo o script (os passos "[demo]" de sempre), depois disto.
//
// Os arquivos que alguém enviar para as pastas durante a apresentação ficam no
// disco do servidor: o script roda em outra máquina e não alcança o disco. A
// linha sai com a pasta; o arquivo fica órfão, sem ninguém ver — o mesmo
// estado que a exclusão deixa quando o disco falha (src/lib/exclusao/arquivos.ts).

import type { Prisma } from "@/generated/prisma/client";
import { executarPlano, juntos, n, type Passo } from "@/lib/exclusao/comum";
import { PLANO_DA_EMPRESA } from "@/lib/exclusao/empresa";
import { PLANO_DO_USUARIO } from "@/lib/exclusao/usuario";
import { FONTE_DA_DEMO as FONTE_DO_RECRUTAMENTO } from "@/lib/demonstracao/recrutamento/plano";
import { DOMINIO_FICTICIO } from "./documentos";
import { MARCA, SETOR } from "./plano";

type Tx = Prisma.TransactionClient;

export type AlvoDaLimpezaDoBpo = {
  tenantId: string;
  /** As empresas "[demo]" que não são do Recrutamento (a do BPO antigo, de antes de 15/10, também). */
  empresas: string[];
  nomesDasEmpresas: string[];
  /** Os espaços "[demo]" do quadro do BPO. */
  espacos: string[];
  etiquetas: string[];
  manuais: string[];
  comunicados: string[];
  /** As pastas internas "[demo]" dos Arquivos (as de dentro e os arquivos saem em cascata). */
  pastas: string[];
  /** O assunto de solicitação "[demo]", criado só quando o escritório não tinha nenhum do BPO. */
  assuntos: string[];
  /** As pessoas fictícias da equipe (contas inativas "[demo]" com e-mail fictício). */
  equipe: string[];
  /** Para quem passaria o que a equipe fictícia tivesse feito fora da demonstração: o primeiro administrador ativo. */
  para: string | null;
};

const comMarca = { startsWith: MARCA };

/** As empresas da limpeza: "[demo]" no nome, menos as do Recrutamento. */
export function ehEmpresaDaLimpeza(e: { name: string; source: string | null }): boolean {
  return e.name.startsWith(MARCA) && e.source !== FONTE_DO_RECRUTAMENTO;
}

/** A equipe fictícia: nome "[demo]", e-mail fictício e conta inativa — as três juntas. Conta de verdade nunca tem as três. */
export function ehPessoaDaEquipe(u: { name: string; email: string; active: boolean }): boolean {
  return u.name.startsWith(MARCA) && u.email.trim().toLowerCase().endsWith(DOMINIO_FICTICIO) && !u.active;
}

export async function alvoDaLimpezaDoBpo(db: Tx, tenantId: string): Promise<AlvoDaLimpezaDoBpo> {
  const [empresas, espacos, etiquetas, manuais, comunicados, pastas, assuntos, equipe, admin] = await juntos(db, [
    () => db.company.findMany({ where: { tenantId, name: comMarca }, select: { id: true, name: true, source: true } }),
    () => db.space.findMany({ where: { tenantId, sectorCode: SETOR, name: comMarca }, select: { id: true } }),
    () => db.tag.findMany({ where: { tenantId, sectorCode: SETOR, name: comMarca }, select: { id: true } }),
    () => db.manualDocument.findMany({ where: { tenantId, sectorCode: SETOR, title: comMarca }, select: { id: true } }),
    () => db.clientAnnouncement.findMany({ where: { tenantId, title: comMarca }, select: { id: true } }),
    () => db.driveFolder.findMany({ where: { tenantId, companyId: null, parentId: null, name: comMarca }, select: { id: true } }),
    () => db.serviceRequestSubject.findMany({ where: { tenantId, label: comMarca }, select: { id: true } }),
    () =>
      db.user.findMany({
        where: { tenantId, name: comMarca, email: { endsWith: DOMINIO_FICTICIO }, active: false },
        select: { id: true, name: true, email: true, active: true },
      }),
    () =>
      db.user.findFirst({
        where: { tenantId, active: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
  ]);
  const daLimpeza = empresas.filter(ehEmpresaDaLimpeza);
  const ids = (l: { id: string }[]) => l.map((x) => x.id);
  return {
    tenantId,
    empresas: ids(daLimpeza),
    nomesDasEmpresas: daLimpeza.map((e) => e.name),
    espacos: ids(espacos),
    etiquetas: ids(etiquetas),
    manuais: ids(manuais),
    comunicados: ids(comunicados),
    pastas: ids(pastas),
    assuntos: ids(assuntos),
    // A mesma regra, conferida de novo em cada linha: se o filtro acima ficar largo, esta trava segura.
    equipe: ids(equipe.filter(ehPessoaDaEquipe)),
    para: admin?.id ?? null,
  };
}

// ─── O plano ────────────────────────────────────────────────────────────────

const vazio = (l: string[]) => l.length === 0;
const dosEspacos = (a: AlvoDaLimpezaDoBpo) => ({ tenantId: a.tenantId, pipeline: { spaceId: { in: a.espacos } } });

/** A ordem importa: o `limpeza.test.ts` confere contra as chaves do banco. */
export const PLANO_DA_LIMPEZA_DO_BPO: readonly Passo<AlvoDaLimpezaDoBpo>[] = [
  { modelo: "Notification", acao: "apagar", executar: async (tx, a) => n(tx.notification.deleteMany({ where: { tenantId: a.tenantId, message: comMarca } })) },
  // A exclusão de empresa só desliga a reunião (companyId vira nulo); a da demonstração sai.
  {
    modelo: "Meeting",
    acao: "apagar",
    executar: async (tx, a) => (vazio(a.empresas) ? 0 : n(tx.meeting.deleteMany({ where: { tenantId: a.tenantId, companyId: { in: a.empresas } } }))),
  },

  // O quadro: subtarefas antes dos cards (a cascata da subtarefa é do banco, mas
  // apagar pai e filho na mesma instrução depende da ordem em que o MySQL varre
  // as linhas). Comentários, horas, checklist, etiquetas do card e reuniões
  // ligadas ao card vão junto (cascata).
  {
    modelo: "PipelineItem",
    acao: "apagar",
    executar: async (tx, a) => (vazio(a.espacos) ? 0 : n(tx.pipelineItem.deleteMany({ where: { ...dosEspacos(a), parentItemId: { not: null } } }))),
  },
  { modelo: "PipelineItem", acao: "apagar", executar: async (tx, a) => (vazio(a.espacos) ? 0 : n(tx.pipelineItem.deleteMany({ where: dosEspacos(a) }))) },
  // Obrigação recorrente que alguém crie numa lista da demonstração: a lista não sai com ela pendurada.
  { modelo: "RecurringObligation", acao: "apagar", executar: async (tx, a) => (vazio(a.espacos) ? 0 : n(tx.recurringObligation.deleteMany({ where: dosEspacos(a) }))) },
  // As etapas vão junto (cascata).
  {
    modelo: "Pipeline",
    acao: "apagar",
    executar: async (tx, a) => (vazio(a.espacos) ? 0 : n(tx.pipeline.deleteMany({ where: { tenantId: a.tenantId, spaceId: { in: a.espacos } } }))),
  },
  { modelo: "Folder", acao: "apagar", executar: async (tx, a) => (vazio(a.espacos) ? 0 : n(tx.folder.deleteMany({ where: { tenantId: a.tenantId, spaceId: { in: a.espacos } } }))) },
  { modelo: "Space", acao: "apagar", executar: async (tx, a) => (vazio(a.espacos) ? 0 : n(tx.space.deleteMany({ where: { tenantId: a.tenantId, id: { in: a.espacos } } }))) },
  { modelo: "Tag", acao: "apagar", executar: async (tx, a) => (vazio(a.etiquetas) ? 0 : n(tx.tag.deleteMany({ where: { tenantId: a.tenantId, id: { in: a.etiquetas } } }))) },

  // As páginas vão junto (cascata).
  {
    modelo: "ManualDocument",
    acao: "apagar",
    executar: async (tx, a) => (vazio(a.manuais) ? 0 : n(tx.manualDocument.deleteMany({ where: { tenantId: a.tenantId, id: { in: a.manuais } } }))),
  },
  // As empresas do comunicado vão junto (cascata).
  {
    modelo: "ClientAnnouncement",
    acao: "apagar",
    executar: async (tx, a) => (vazio(a.comunicados) ? 0 : n(tx.clientAnnouncement.deleteMany({ where: { tenantId: a.tenantId, id: { in: a.comunicados } } }))),
  },
  {
    modelo: "TenantIntegration",
    acao: "apagar",
    executar: async (tx, a) =>
      vazio(a.empresas)
        ? 0
        : n(tx.tenantIntegration.deleteMany({ where: { tenantId: a.tenantId, integrationCode: "omie", instanceKey: { in: a.empresas.map((id) => `empresa:${id}`) } } })),
  },
  // As pastas de dentro e os arquivos (as linhas) vão junto (cascata).
  {
    modelo: "DriveFolder",
    acao: "apagar",
    executar: async (tx, a) => (vazio(a.pastas) ? 0 : n(tx.driveFolder.deleteMany({ where: { tenantId: a.tenantId, id: { in: a.pastas } } }))),
  },

  // As empresas: tudo o que estiver ligado, pelo plano da exclusão de empresa
  // do Connect — menos o passo da empresa, que é do script.
  ...PLANO_DA_EMPRESA.filter((p) => p.modelo !== "Company").map<Passo<AlvoDaLimpezaDoBpo>>((p) => ({
    ...p,
    executar: async (tx, a) => {
      let total = 0;
      for (const id of a.empresas) total += await p.executar(tx, { tenantId: a.tenantId, id });
      return total;
    },
  })),

  // Depois das solicitações (que saem com a empresa).
  {
    modelo: "ServiceRequestSubject",
    acao: "apagar",
    executar: async (tx, a) => (vazio(a.assuntos) ? 0 : n(tx.serviceRequestSubject.deleteMany({ where: { tenantId: a.tenantId, id: { in: a.assuntos } } }))),
  },

  // A equipe fictícia, pelo plano da exclusão de usuário do Connect: o que ela
  // fez na demonstração já saiu com os cards; se alguém tiver ligado uma dessas
  // contas a outra coisa, passa para o primeiro administrador em vez de travar.
  ...PLANO_DO_USUARIO.map<Passo<AlvoDaLimpezaDoBpo>>((p) => ({
    ...p,
    executar: async (tx, a) => {
      if (!a.para) return 0;
      let total = 0;
      for (const id of a.equipe) total += await p.executar(tx, { tenantId: a.tenantId, id, para: a.para });
      return total;
    },
  })),
];

// ─── A prévia (simulação) ───────────────────────────────────────────────────

export type PreviaDaLimpezaDoBpo = {
  empresas: string[];
  contagens: { rotulo: string; quantidade: number }[];
  /** Linhas de arquivo nas pastas que saem: os bytes ficam no disco do servidor. */
  arquivosNoServidor: number;
};

export async function previaDaLimpezaDoBpo(db: Tx, a: AlvoDaLimpezaDoBpo): Promise<PreviaDaLimpezaDoBpo> {
  const t = a.tenantId;
  const daEmpresa = { tenantId: t, companyId: { in: a.empresas } };
  const [lancamentos, transacoes, pendencias, solicitacoes, reunioes, cards, avisos, senhas, emissoes, arquivos] = await juntos(db, [
    () => db.financeEntry.count({ where: daEmpresa }),
    () => db.bankTransaction.count({ where: { tenantId: t, bankAccount: { companyId: { in: a.empresas } } } }),
    () => db.clientRequest.count({ where: daEmpresa }),
    () => db.serviceRequest.count({ where: daEmpresa }),
    () => db.meeting.count({ where: daEmpresa }),
    () => db.pipelineItem.count({ where: dosEspacos(a) }),
    () => db.notification.count({ where: { tenantId: t, message: comMarca } }),
    () => db.bpoCredential.count({ where: daEmpresa }),
    () => db.omieEmissao.count({ where: daEmpresa }),
    () =>
      db.driveFile.count({
        where: { tenantId: t, OR: [{ folder: { companyId: { in: a.empresas } } }, { folder: { id: { in: a.pastas } } }, { folder: { parentId: { in: a.pastas } } }] },
      }),
  ]);
  return {
    empresas: a.nomesDasEmpresas,
    contagens: [
      { rotulo: "lançamentos", quantidade: lancamentos },
      { rotulo: "transações de extrato", quantidade: transacoes },
      { rotulo: "pedidos ao cliente", quantidade: pendencias },
      { rotulo: "solicitações", quantidade: solicitacoes },
      { rotulo: "reuniões", quantidade: reunioes },
      { rotulo: "cards do quadro [demo]", quantidade: cards },
      { rotulo: "notificações [demo]", quantidade: avisos },
      { rotulo: "senhas do cofre", quantidade: senhas },
      { rotulo: "emissões de NFS-e", quantidade: emissoes },
      { rotulo: "etiquetas [demo]", quantidade: a.etiquetas.length },
      { rotulo: "manuais [demo]", quantidade: a.manuais.length },
      { rotulo: "comunicados [demo]", quantidade: a.comunicados.length },
      { rotulo: "pastas internas [demo]", quantidade: a.pastas.length },
      { rotulo: "pessoas fictícias da equipe", quantidade: a.equipe.length },
    ],
    arquivosNoServidor: arquivos,
  };
}

// ─── Execução ───────────────────────────────────────────────────────────────

const ROTULO_DO_MODELO: Record<string, string> = {
  Notification: "notificações",
  Meeting: "reuniões",
  PipelineItem: "cards",
  Pipeline: "listas do quadro",
  Folder: "pastas do quadro",
  Space: "espaços do quadro",
  Tag: "etiquetas",
  ManualDocument: "manuais",
  ClientAnnouncement: "comunicados",
  TenantIntegration: "integrações do Omie",
  DriveFolder: "pastas dos Arquivos",
  FinanceEntry: "lançamentos",
  BankTransaction: "transações de extrato",
  BankStatementImport: "extratos",
  BankTransactionMatch: "conciliações",
  ClientRequest: "pedidos ao cliente",
  CompanyMessage: "mensagens",
  ServiceRequest: "solicitações",
  ServiceRequestSubject: "assuntos de solicitação",
  FinanceCounterparty: "contrapartes",
  FinanceCategory: "categorias",
  CostCenter: "centros de custo",
  BankAccount: "contas bancárias",
  CollectionAgreement: "acordos",
  Budget: "orçamentos",
  BpoCredential: "senhas do cofre",
  OmieEmissao: "emissões de NFS-e",
  Process: "processos do Societário",
  UserLastCompany: "registros de última empresa aberta",
  User: "pessoas fictícias da equipe",
  CollectionReminderOptOut: "exclusões da régua de cobrança",
  PortalApprovalLimit: "alçadas de aprovação",
  "FinanceEntry.agreementId:anular": "parcelas desligadas do acordo",
  "FinanceEntry.renegotiatedAgreementId:anular": "títulos desligados do acordo",
};

/** "34 lançamentos", na ordem em que saíram. */
export function frasesDoQueSaiu(mexido: Record<string, number>): string[] {
  return Object.entries(mexido)
    .filter(([, q]) => q > 0)
    .map(([chave, q]) => `${q} ${ROTULO_DO_MODELO[chave] ?? chave}`);
}

/**
 * Apaga a demonstração do BPO. Chamar DENTRO da transação da limpeza: se algo
 * travar, nada sai. Devolve o que saiu e a prévia tirada antes de apagar.
 */
export async function limparBpoDaDemo(tx: Tx, tenantId: string): Promise<{ feito: string[]; previa: PreviaDaLimpezaDoBpo }> {
  const alvo = await alvoDaLimpezaDoBpo(tx, tenantId);
  const previa = await previaDaLimpezaDoBpo(tx, alvo);
  const mexido = await executarPlano(tx, PLANO_DA_LIMPEZA_DO_BPO, alvo);
  return { feito: frasesDoQueSaiu(mexido), previa };
}
