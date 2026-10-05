// Leitura das solicitações: a fila da equipe, a lista do cliente e o detalhe.
//
// As notas internas (`internal`) só saem quando quem pede é a equipe — o filtro
// fica aqui, na consulta, e não na tela: a tela do portal não tem como mostrar
// o que nunca recebeu.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import type { AnexoDaConversa, MensagemDaConversa } from "@/lib/financeiro/pendencias/consultas";
import { situacaoDaResposta, type SituacaoDaResposta, type StatusDaSolicitacao } from "./regras";

export type MensagemDaSolicitacao = MensagemDaConversa & { interna: boolean };

/** A equipe: setores da fila (`null` = todos) e quem pede, que também vê o que é dele. */
export type EscopoDaEquipe = { tenantId: string; setores: string[] | null; userId: string };
/** O cliente: só as empresas do grupo dele. */
export type EscopoDoCliente = { tenantId: string; companyIds: string[] };

export const RECORTES_DA_EQUIPE = [
  { chave: "abertas", rotulo: "Em aberto" },
  { chave: "novas", rotulo: "Novas" },
  { chave: "minhas", rotulo: "Minhas" },
  { chave: "aguardando", rotulo: "Aguardando cliente" },
  { chave: "encerradas", rotulo: "Encerradas" },
  { chave: "todas", rotulo: "Todas" },
] as const;
export type RecorteDaEquipe = (typeof RECORTES_DA_EQUIPE)[number]["chave"];

const EM_ABERTO: StatusDaSolicitacao[] = ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CLIENTE"];
const ENCERRADAS: StatusDaSolicitacao[] = ["CONCLUIDA", "CANCELADA"];

/** Meia-noite de hoje em São Paulo: prazo (meio-dia UTC do dia) antes disso é de um dia que já passou. */
function inicioDeHoje(agora: Date): Date {
  return new Date(`${saoPauloParts(agora).dateKey}T00:00:00-03:00`);
}

function whereDaEquipe(e: EscopoDaEquipe): Prisma.ServiceRequestWhereInput {
  if (e.setores === null) return { tenantId: e.tenantId };
  return { tenantId: e.tenantId, OR: [{ sectorCode: { in: e.setores } }, { assigneeId: e.userId }] };
}

export type LinhaDaFila = {
  id: string;
  numero: number;
  assunto: string;
  setor: string;
  empresaId: string;
  empresaNome: string;
  status: StatusDaSolicitacao;
  prazo: Date;
  situacao: SituacaoDaResposta;
  responsavel: string | null;
  atualizadaEm: Date;
  mensagens: number;
  anexos: number;
};

export type ContadoresDaFila = { novas: number; minhas: number; atrasadas: number; aguardando: number };

const LIMITE_DA_LISTA = 500;

/**
 * A fila da equipe. Os contadores ignoram o recorte (são o mapa da fila, como
 * na pendência), mas respeitam setor e empresa filtrados.
 */
export async function listarParaEquipe(
  escopo: EscopoDaEquipe,
  filtros: { recorte: RecorteDaEquipe; setor: string | null; empresaId: string | null; atrasadas: boolean },
  agora: Date
): Promise<{ linhas: LinhaDaFila[]; contadores: ContadoresDaFila; limitado: boolean }> {
  const prisma = getPrisma();
  const hoje = inicioDeHoje(agora);
  const base: Prisma.ServiceRequestWhereInput = {
    AND: [
      whereDaEquipe(escopo),
      filtros.setor ? { sectorCode: filtros.setor } : {},
      filtros.empresaId ? { companyId: filtros.empresaId } : {},
    ],
  };
  const atrasadas: Prisma.ServiceRequestWhereInput = { status: { in: EM_ABERTO }, firstResponseAt: null, responseDue: { lt: hoje } };

  const doRecorte: Record<RecorteDaEquipe, Prisma.ServiceRequestWhereInput> = {
    abertas: { status: { in: EM_ABERTO } },
    novas: { status: "ABERTA" },
    minhas: { status: { in: EM_ABERTO }, assigneeId: escopo.userId },
    aguardando: { status: "AGUARDANDO_CLIENTE" },
    encerradas: { status: { in: ENCERRADAS } },
    todas: {},
  };

  const [linhas, novas, minhas, nAtrasadas, aguardando] = await Promise.all([
    prisma.serviceRequest.findMany({
      where: { AND: [base, filtros.atrasadas ? atrasadas : doRecorte[filtros.recorte]] },
      orderBy: [{ lastMessageAt: "desc" }],
      take: LIMITE_DA_LISTA + 1,
      select: {
        id: true,
        number: true,
        sectorCode: true,
        status: true,
        responseDue: true,
        firstResponseAt: true,
        lastMessageAt: true,
        subject: { select: { label: true } },
        company: { select: { id: true, name: true, displayName: true } },
        assignee: { select: { name: true } },
        _count: { select: { messages: true, attachments: true } },
      },
    }),
    prisma.serviceRequest.count({ where: { AND: [base, { status: "ABERTA" }] } }),
    prisma.serviceRequest.count({ where: { AND: [base, doRecorte.minhas] } }),
    prisma.serviceRequest.count({ where: { AND: [base, atrasadas] } }),
    prisma.serviceRequest.count({ where: { AND: [base, { status: "AGUARDANDO_CLIENTE" }] } }),
  ]);

  return {
    linhas: linhas.slice(0, LIMITE_DA_LISTA).map((s) => ({
      id: s.id,
      numero: s.number,
      assunto: s.subject.label,
      setor: s.sectorCode,
      empresaId: s.company.id,
      empresaNome: nomeExibicao(s.company),
      status: s.status,
      prazo: s.responseDue,
      situacao: situacaoDaResposta(s, agora),
      responsavel: s.assignee?.name ?? null,
      atualizadaEm: s.lastMessageAt,
      mensagens: s._count.messages,
      anexos: s._count.attachments,
    })),
    contadores: { novas, minhas, atrasadas: nAtrasadas, aguardando },
    limitado: linhas.length > LIMITE_DA_LISTA,
  };
}

export type LinhaDoCliente = {
  id: string;
  numero: number;
  assunto: string;
  empresaNome: string;
  status: StatusDaSolicitacao;
  prazo: Date;
  respondidaEm: Date | null;
  atualizadaEm: Date;
};

export type RecorteDoCliente = "abertas" | "aguardando" | "encerradas";

// "Aguardando você" (05/10): o botão do Início leva a lista já filtrada.
const STATUS_DO_RECORTE_DO_CLIENTE: Record<RecorteDoCliente, StatusDaSolicitacao[]> = {
  abertas: EM_ABERTO,
  aguardando: ["AGUARDANDO_CLIENTE"],
  encerradas: ENCERRADAS,
};

/** A lista do cliente: as das empresas dele, a que mexeu por último primeiro. */
export async function listarDoCliente(escopo: EscopoDoCliente, recorte: RecorteDoCliente): Promise<LinhaDoCliente[]> {
  const linhas = await getPrisma().serviceRequest.findMany({
    where: {
      tenantId: escopo.tenantId,
      companyId: { in: escopo.companyIds },
      status: { in: STATUS_DO_RECORTE_DO_CLIENTE[recorte] },
    },
    orderBy: [{ lastMessageAt: "desc" }],
    take: LIMITE_DA_LISTA,
    select: {
      id: true,
      number: true,
      status: true,
      responseDue: true,
      firstResponseAt: true,
      lastMessageAt: true,
      subject: { select: { label: true } },
      company: { select: { name: true, displayName: true } },
    },
  });
  return linhas.map((s) => ({
    id: s.id,
    numero: s.number,
    assunto: s.subject.label,
    empresaNome: nomeExibicao(s.company),
    status: s.status,
    prazo: s.responseDue,
    respondidaEm: s.firstResponseAt,
    atualizadaEm: s.lastMessageAt,
  }));
}

/** Quantas esperam o cliente — o aviso do topo da home do portal. */
export async function solicitacoesAguardandoCliente(escopo: EscopoDoCliente): Promise<number> {
  if (escopo.companyIds.length === 0) return 0;
  return getPrisma().serviceRequest.count({
    where: { tenantId: escopo.tenantId, companyId: { in: escopo.companyIds }, status: "AGUARDANDO_CLIENTE" },
  });
}

/** Até onde uma resposta da equipe ainda é "nova" no Início do portal. */
const DIAS_DA_RESPOSTA_NOVA = 7;

/**
 * Em andamento, com a última mensagem visível escrita pela equipe nos últimos
 * dias — a "resposta nova" do Início do portal (05/10).
 *
 * Não há marca de leitura do cliente na solicitação, e não se cria uma para
 * isto: "nova" é recente e ainda sem resposta do cliente depois dela. As que
 * esperam o cliente (`AGUARDANDO_CLIENTE`) ficam de fora — já são o outro aviso.
 * Só a última mensagem de cada uma, e no máximo cem: o cliente tem poucas
 * abertas, e o índice `[tenantId, companyId, status]` chega nelas direto.
 */
export async function solicitacoesComRespostaDaEquipe(escopo: EscopoDoCliente, agora: Date): Promise<number> {
  if (escopo.companyIds.length === 0) return 0;
  const desde = new Date(agora.getTime() - DIAS_DA_RESPOSTA_NOVA * 24 * 60 * 60 * 1000);
  const linhas = await getPrisma().serviceRequest.findMany({
    where: {
      tenantId: escopo.tenantId,
      companyId: { in: escopo.companyIds },
      status: "EM_ANDAMENTO",
      lastMessageAt: { gte: desde },
    },
    select: {
      messages: { where: { internal: false }, orderBy: { createdAt: "desc" }, take: 1, select: { authorPortalUserId: true } },
    },
    take: 100,
  });
  // Autor da equipe = sem autor do portal (o usuário interno pode ter sido apagado).
  return linhas.filter((s) => s.messages[0] && s.messages[0].authorPortalUserId === null).length;
}

export type SolicitacaoDetalhada = {
  id: string;
  numero: number;
  assunto: string;
  setor: string;
  status: StatusDaSolicitacao;
  prazo: Date;
  respondidaEm: Date | null;
  situacao: SituacaoDaResposta;
  empresaId: string;
  empresaNome: string;
  responsavel: { id: string; nome: string } | null;
  abertaPor: string;
  abertaEm: Date;
  descricao: string;
  anexosDaAbertura: AnexoDaConversa[];
  mensagens: MensagemDaSolicitacao[];
  encerradaEm: Date | null;
  encerradaPor: string | null;
};

/**
 * Uma solicitação com a conversa.
 *
 * `quem` decide o recorte: o cliente só alcança as empresas do grupo e nunca
 * recebe nota interna; a equipe recebe tudo do tenant — quem chama confere se a
 * pessoa enxerga o setor (`podeVerSolicitacao`), com o setor e o responsável
 * que esta consulta devolve.
 */
export async function carregarSolicitacao(
  quem: { lado: "EQUIPE"; tenantId: string } | { lado: "CLIENTE"; escopo: EscopoDoCliente },
  id: string,
  agora: Date
): Promise<(SolicitacaoDetalhada & { assigneeId: string | null }) | null> {
  const ehEquipe = quem.lado === "EQUIPE";
  const where: Prisma.ServiceRequestWhereInput = ehEquipe
    ? { id, tenantId: quem.tenantId }
    : { id, tenantId: quem.escopo.tenantId, companyId: { in: quem.escopo.companyIds } };

  const s = await getPrisma().serviceRequest.findFirst({
    where,
    select: {
      id: true,
      number: true,
      sectorCode: true,
      status: true,
      description: true,
      responseDue: true,
      firstResponseAt: true,
      createdAt: true,
      closedAt: true,
      assigneeId: true,
      subject: { select: { label: true } },
      company: { select: { id: true, name: true, displayName: true } },
      assignee: { select: { id: true, name: true } },
      openedByPortal: { select: { name: true } },
      closedBy: { select: { name: true } },
      attachments: {
        where: { messageId: null },
        select: { id: true, fileName: true, sizeBytes: true },
        orderBy: { createdAt: "asc" },
      },
      messages: {
        where: ehEquipe ? {} : { internal: false },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          internal: true,
          createdAt: true,
          authorUser: { select: { name: true } },
          authorPortal: { select: { name: true } },
          attachments: { select: { id: true, fileName: true, sizeBytes: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!s) return null;

  return {
    id: s.id,
    numero: s.number,
    assunto: s.subject.label,
    setor: s.sectorCode,
    status: s.status,
    prazo: s.responseDue,
    respondidaEm: s.firstResponseAt,
    situacao: situacaoDaResposta(s, agora),
    empresaId: s.company.id,
    empresaNome: nomeExibicao(s.company),
    responsavel: s.assignee ? { id: s.assignee.id, nome: s.assignee.name } : null,
    assigneeId: s.assigneeId,
    abertaPor: s.openedByPortal?.name ?? "Cliente",
    abertaEm: s.createdAt,
    descricao: s.description,
    anexosDaAbertura: s.attachments,
    mensagens: s.messages.map((m) => ({
      id: m.id,
      // Do cliente só quando o autor do portal existe — mesma régua da pendência.
      lado: m.authorPortal ? "CLIENTE" : "EQUIPE",
      autorNome: m.authorPortal?.name ?? m.authorUser?.name ?? "Equipe",
      corpo: m.body,
      criadaEm: m.createdAt,
      anexos: m.attachments,
      interna: m.internal,
    })),
    encerradaEm: s.closedAt,
    encerradaPor: s.closedBy?.name ?? null,
  };
}
