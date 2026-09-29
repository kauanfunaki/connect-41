// A fila de propostas da IA (`AgentProposal`), criada em 29/09 para as funções
// de IA do protótipo do Societário: a varredura de pendências e a leitura do
// contrato social.
//
// O agente propõe; o coordenador do setor aprova, corrige ou rejeita. Aprovar
// não passa por aqui: cada tela chama o seu próprio caminho de gravação e só
// depois fecha a proposta com `concluirProposta`, dizendo o que valeu.
//
// A parte pura (`calcularQualidade`) é o painel de qualidade do protótipo:
// quanto a IA acerta sem ajuste, quanto é corrigida, quanto é descartada — mais
// o custo, que o protótipo não tinha.

import type { Prisma } from "@/generated/prisma/client";
import type { PropostaConfianca, PropostaStatus } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";

export async function criarProposta(dados: {
  tenantId: string;
  agentCode: string;
  sectorCode: string;
  runId: string | null;
  entityType?: string | null;
  entityId?: string | null;
  title: string;
  payload: Prisma.InputJsonValue;
  confidence: PropostaConfianca | null;
  createdById: string | null;
}): Promise<string> {
  const p = await getPrisma().agentProposal.create({
    data: {
      tenantId: dados.tenantId,
      agentCode: dados.agentCode,
      sectorCode: dados.sectorCode,
      runId: dados.runId,
      entityType: dados.entityType ?? null,
      entityId: dados.entityId ?? null,
      title: dados.title.slice(0, 200),
      payload: dados.payload,
      confidence: dados.confidence,
      createdById: dados.createdById,
    },
    select: { id: true },
  });
  return p.id;
}

export async function propostaDoSetor(id: string, tenantId: string, sectorCode: string) {
  return getPrisma().agentProposal.findFirst({
    where: { id, tenantId, sectorCode },
    include: {
      createdBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
  });
}

export async function propostasDoSetor(tenantId: string, sectorCode: string) {
  const prisma = getPrisma();
  const [pendentes, revisadas] = await Promise.all([
    prisma.agentProposal.findMany({
      where: { tenantId, sectorCode, status: "PENDENTE" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.agentProposal.findMany({
      where: { tenantId, sectorCode, status: { not: "PENDENTE" } },
      orderBy: { reviewedAt: "desc" },
      take: 20,
      include: { reviewedBy: { select: { name: true } } },
    }),
  ]);
  return { pendentes, revisadas };
}

export async function contarPendentesDoSetor(tenantId: string, sectorCode: string): Promise<number> {
  return getPrisma().agentProposal.count({ where: { tenantId, sectorCode, status: "PENDENTE" } });
}

/**
 * Fecha a proposta. Só fecha a que ainda está pendente — duas pessoas
 * aprovando a mesma ao mesmo tempo não gravam duas vezes: a segunda recebe
 * `false` e desiste.
 */
export async function concluirProposta(dados: {
  id: string;
  tenantId: string;
  status: Exclude<PropostaStatus, "PENDENTE">;
  appliedPayload?: Prisma.InputJsonValue;
  notes?: string | null;
  reviewedById: string;
}): Promise<boolean> {
  const r = await getPrisma().agentProposal.updateMany({
    where: { id: dados.id, tenantId: dados.tenantId, status: "PENDENTE" },
    data: {
      status: dados.status,
      appliedPayload: dados.appliedPayload,
      notes: dados.notes ?? null,
      reviewedById: dados.reviewedById,
      reviewedAt: new Date(),
    },
  });
  return r.count === 1;
}

// ─── Painel de qualidade ─────────────────────────────────────────────────────

export type LinhaDeQualidade = {
  agentCode: string;
  status: PropostaStatus;
  confidence: PropostaConfianca | null;
  createdAt: Date;
  custoCentavos: number | null;
};

export type QualidadeDoAgente = {
  agentCode: string;
  total: number;
  pendentes: number;
  aprovadas: number;
  editadas: number;
  rejeitadas: number;
  /** Das revisadas, quantas precisaram de ajuste. Nulo sem nenhuma revisada. */
  taxaDeEdicao: number | null;
  taxaDeRejeicao: number | null;
  confianca: Record<PropostaConfianca, number>;
  custoCentavos: number;
  /** Propostas por mês, do mais antigo ao atual — sempre `meses` posições. */
  porMes: { mes: string; total: number }[];
};

/** Chave de mês (AAAA-MM) em São Paulo, onde o setor trabalha. */
function mesEmSaoPaulo(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export function calcularQualidade(linhas: LinhaDeQualidade[], agora: Date, meses = 6): QualidadeDoAgente[] {
  const mesesDoPeriodo: string[] = [];
  const base = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 15));
    mesesDoPeriodo.push(d.toISOString().slice(0, 7));
  }
  const porAgente = new Map<string, LinhaDeQualidade[]>();
  for (const l of linhas) porAgente.set(l.agentCode, [...(porAgente.get(l.agentCode) ?? []), l]);

  return [...porAgente.entries()]
    .map(([agentCode, ls]) => {
      const conta = (s: PropostaStatus) => ls.filter((l) => l.status === s).length;
      const aprovadas = conta("APROVADA");
      const editadas = conta("EDITADA");
      const rejeitadas = conta("REJEITADA");
      const revisadas = aprovadas + editadas + rejeitadas;
      const confianca: Record<PropostaConfianca, number> = { ALTA: 0, MEDIA: 0, BAIXA: 0 };
      for (const l of ls) if (l.confidence) confianca[l.confidence]++;
      return {
        agentCode,
        total: ls.length,
        pendentes: conta("PENDENTE"),
        aprovadas,
        editadas,
        rejeitadas,
        taxaDeEdicao: revisadas ? editadas / revisadas : null,
        taxaDeRejeicao: revisadas ? rejeitadas / revisadas : null,
        confianca,
        custoCentavos: ls.reduce((t, l) => t + (l.custoCentavos ?? 0), 0),
        porMes: mesesDoPeriodo.map((mes) => ({ mes, total: ls.filter((l) => mesEmSaoPaulo(l.createdAt) === mes).length })),
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Os últimos seis meses de propostas do setor, com o custo de cada execução. */
export async function qualidadeDoSetor(tenantId: string, sectorCode: string, agora = new Date()): Promise<QualidadeDoAgente[]> {
  const prisma = getPrisma();
  const desde = new Date(agora.getTime() - 190 * 24 * 60 * 60 * 1000);
  const propostas = await prisma.agentProposal.findMany({
    where: { tenantId, sectorCode, createdAt: { gte: desde } },
    select: { agentCode: true, status: true, confidence: true, createdAt: true, runId: true },
  });
  const runIds = propostas.map((p) => p.runId).filter((r): r is string => !!r);
  const runs = runIds.length
    ? await prisma.agentRun.findMany({ where: { tenantId, id: { in: runIds } }, select: { id: true, costCents: true } })
    : [];
  const custo = new Map(runs.map((r) => [r.id, r.costCents]));
  return calcularQualidade(
    propostas.map((p) => ({
      agentCode: p.agentCode,
      status: p.status,
      confidence: p.confidence,
      createdAt: p.createdAt,
      custoCentavos: p.runId ? (custo.get(p.runId) ?? null) : null,
    })),
    agora
  );
}
