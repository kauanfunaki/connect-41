// Consultas das pendências, para a equipe e para o portal.
//
// O escopo é o primeiro argumento, como em `financeiro/consultas.ts`: a equipe
// vê o tenant, o cliente vê as empresas do grupo. `companyIds: []` casa com
// nada — cliente sem empresa não herda o tenant por uma lista vazia.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { situacaoDoPrazo, type SituacaoDoPrazo, type StatusDaPendencia, type TipoDaPendencia } from "./regras";

export type AnexoDaConversa = { id: string; fileName: string; sizeBytes: number };

export type MensagemDaConversa = {
  id: string;
  /** Da equipe ou do cliente — é o que decide o lado e o rótulo na conversa. */
  lado: "EQUIPE" | "CLIENTE";
  autorNome: string;
  corpo: string;
  criadaEm: Date;
  anexos: AnexoDaConversa[];
};

export type EscopoDePendencias = { tenantId: string; companyIds: string[] | null };

export const RECORTES_DE_PENDENCIA = [
  { chave: "andamento", rotulo: "Em andamento" },
  { chave: "aguardando", rotulo: "Aguardando cliente" },
  { chave: "respondidas", rotulo: "Respondidas" },
  { chave: "encerradas", rotulo: "Encerradas" },
  { chave: "todas", rotulo: "Todas" },
] as const;

export type RecorteDePendencia = (typeof RECORTES_DE_PENDENCIA)[number]["chave"];

const STATUS_DO_RECORTE: Record<RecorteDePendencia, StatusDaPendencia[] | null> = {
  andamento: ["ABERTA", "RESPONDIDA"],
  aguardando: ["ABERTA"],
  respondidas: ["RESPONDIDA"],
  encerradas: ["RESOLVIDA", "CANCELADA"],
  todas: null,
};

function whereDoEscopo(e: EscopoDePendencias): Prisma.ClientRequestWhereInput {
  return e.companyIds === null ? { tenantId: e.tenantId } : { tenantId: e.tenantId, companyId: { in: e.companyIds } };
}

/** Meia-noite de hoje em São Paulo: prazo (meio-dia UTC do dia) antes disso é de um dia que já passou. */
function inicioDeHoje(agora: Date): Date {
  return new Date(`${saoPauloParts(agora).dateKey}T00:00:00-03:00`);
}

export type LinhaDePendencia = {
  id: string;
  titulo: string;
  tipo: TipoDaPendencia;
  status: StatusDaPendencia;
  prazo: Date | null;
  situacaoDoPrazo: SituacaoDoPrazo;
  empresaId: string;
  empresaNome: string;
  atualizadaEm: Date;
  mensagens: number;
  anexos: number;
};

export type ContadoresDePendencias = { aguardando: number; respondidas: number; vencidas: number; encerradas: number };

const LIMITE_DA_LISTA = 500;

export async function listarPendencias(
  escopo: EscopoDePendencias,
  filtro: { recorte: RecorteDePendencia; empresaId?: string | null; vencidas?: boolean },
  agora: Date
): Promise<{ linhas: LinhaDePendencia[]; contadores: ContadoresDePendencias; limitado: boolean }> {
  const prisma = getPrisma();
  const base = whereDoEscopo(escopo);
  const daEmpresa: Prisma.ClientRequestWhereInput = filtro.empresaId ? { companyId: filtro.empresaId } : {};
  const statusDoRecorte = STATUS_DO_RECORTE[filtro.recorte];
  const vencida: Prisma.ClientRequestWhereInput = {
    status: { in: ["ABERTA", "RESPONDIDA"] },
    dueDate: { lt: inicioDeHoje(agora) },
  };

  const where: Prisma.ClientRequestWhereInput = {
    AND: [
      base,
      daEmpresa,
      statusDoRecorte ? { status: { in: statusDoRecorte } } : {},
      filtro.vencidas ? vencida : {},
    ],
  };

  const [linhas, porStatus, vencidas] = await Promise.all([
    prisma.clientRequest.findMany({
      where,
      select: {
        id: true,
        title: true,
        kind: true,
        status: true,
        dueDate: true,
        updatedAt: true,
        company: { select: { id: true, name: true, displayName: true } },
        _count: { select: { messages: true, attachments: true } },
      },
      // Prazo mais próximo primeiro, sem prazo por último; empate pela mais
      // parada — é a ordem em que alguém precisa cobrar.
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "asc" }],
      take: LIMITE_DA_LISTA + 1,
    }),
    prisma.clientRequest.groupBy({ by: ["status"], where: { AND: [base, daEmpresa] }, _count: { _all: true } }),
    prisma.clientRequest.count({ where: { AND: [base, daEmpresa, vencida] } }),
  ]);

  const conta = (s: StatusDaPendencia) => porStatus.find((p) => p.status === s)?._count._all ?? 0;
  return {
    linhas: linhas.slice(0, LIMITE_DA_LISTA).map((l) => ({
      id: l.id,
      titulo: l.title,
      tipo: l.kind,
      status: l.status,
      prazo: l.dueDate,
      situacaoDoPrazo: situacaoDoPrazo(l.dueDate, agora),
      empresaId: l.company.id,
      empresaNome: nomeExibicao(l.company),
      atualizadaEm: l.updatedAt,
      mensagens: l._count.messages,
      anexos: l._count.attachments,
    })),
    contadores: {
      aguardando: conta("ABERTA"),
      respondidas: conta("RESPONDIDA"),
      vencidas,
      encerradas: conta("RESOLVIDA") + conta("CANCELADA"),
    },
    limitado: linhas.length > LIMITE_DA_LISTA,
  };
}

/** Quantas esperam o cliente — o número da home do portal. */
export async function pendenciasAguardandoCliente(escopo: EscopoDePendencias): Promise<number> {
  return getPrisma().clientRequest.count({ where: { ...whereDoEscopo(escopo), status: "ABERTA" } });
}

export type PendenciaDetalhada = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoDaPendencia;
  status: StatusDaPendencia;
  prazo: Date | null;
  situacaoDoPrazo: SituacaoDoPrazo;
  empresaId: string;
  empresaNome: string;
  abertaPor: string;
  abertaEm: Date;
  resolvidaEm: Date | null;
  resolvidaPor: string | null;
  lancamento: { id: string; kind: "PAGAR" | "RECEBER"; contraparteNome: string; valor: { toString(): string }; vencimento: Date } | null;
  anexosDaAbertura: AnexoDaConversa[];
  mensagens: MensagemDaConversa[];
};

export type LembreteDaPendencia = {
  passo: number;
  em: Date;
  destinatarios: number;
  falhas: number;
  ok: boolean;
  erro: string | null;
};

/**
 * A pendência com a conversa.
 *
 * O nome de quem é da equipe aparece para o cliente como está no cadastro:
 * é a pessoa com quem ele está falando. O contrário também vale.
 */
export async function carregarPendencia(escopo: EscopoDePendencias, id: string, agora: Date): Promise<PendenciaDetalhada | null> {
  const prisma = getPrisma();
  const p = await prisma.clientRequest.findFirst({
    where: { ...whereDoEscopo(escopo), id },
    select: {
      id: true,
      title: true,
      description: true,
      kind: true,
      status: true,
      dueDate: true,
      createdAt: true,
      resolvedAt: true,
      company: { select: { id: true, name: true, displayName: true } },
      createdBy: { select: { name: true } },
      resolvedBy: { select: { name: true } },
      financeEntry: {
        select: { id: true, kind: true, amount: true, dueDate: true, counterparty: { select: { name: true } } },
      },
      attachments: {
        where: { messageId: null },
        select: { id: true, fileName: true, sizeBytes: true },
        orderBy: { createdAt: "asc" },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          authorUser: { select: { name: true } },
          authorPortal: { select: { name: true } },
          attachments: { select: { id: true, fileName: true, sizeBytes: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!p) return null;

  return {
    id: p.id,
    titulo: p.title,
    descricao: p.description,
    tipo: p.kind,
    status: p.status,
    prazo: p.dueDate,
    situacaoDoPrazo: situacaoDoPrazo(p.dueDate, agora),
    empresaId: p.company.id,
    empresaNome: nomeExibicao(p.company),
    abertaPor: p.createdBy?.name ?? "Equipe",
    abertaEm: p.createdAt,
    resolvidaEm: p.resolvedAt,
    resolvidaPor: p.resolvedBy?.name ?? null,
    lancamento: p.financeEntry
      ? {
          id: p.financeEntry.id,
          kind: p.financeEntry.kind,
          contraparteNome: p.financeEntry.counterparty.name,
          valor: p.financeEntry.amount,
          vencimento: p.financeEntry.dueDate,
        }
      : null,
    anexosDaAbertura: p.attachments,
    mensagens: p.messages.map((m) => ({
      id: m.id,
      // Do cliente só quando o autor do portal existe; autor removido (SetNull)
      // cai como equipe, que é o lado que não expõe nome de outro cliente.
      lado: m.authorPortal ? "CLIENTE" : "EQUIPE",
      autorNome: m.authorPortal?.name ?? m.authorUser?.name ?? "Equipe",
      corpo: m.body,
      criadaEm: m.createdAt,
      anexos: m.attachments,
    })),
  };
}

/**
 * Os lembretes automáticos que a pendência já recebeu, do primeiro passo ao último.
 *
 * Fora de `carregarPendencia` de propósito: é informação só da equipe, e o
 * portal do cliente não tem por que consultar esta tabela — nem depender dela.
 */
export async function lembretesDaPendencia(tenantId: string, requestId: string): Promise<LembreteDaPendencia[]> {
  const linhas = await getPrisma().clientRequestReminder.findMany({
    where: { tenantId, requestId },
    orderBy: { step: "asc" },
    select: { step: true, sentAt: true, recipients: true, failures: true, ok: true, error: true },
  });
  return linhas.map((l) => ({
    passo: l.step,
    em: l.sentAt,
    destinatarios: l.recipients,
    falhas: l.failures,
    ok: l.ok,
    erro: l.error,
  }));
}
