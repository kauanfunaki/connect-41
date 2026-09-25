// Leitura do Societário para o portal do cliente. As regras do que aparece
// estão em `portal.ts`.
//
// Todo `where` leva o tenant **e** as empresas do cliente (`alcanceDoCliente`).
// O id do processo vem da URL, então buscar só por id e conferir a empresa
// depois já teria trazido para a memória o processo de outro cliente.

import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { prazoDoProcesso, situacaoDoProcesso, type StatusDaEtapa, type StatusDoProcesso } from "./processo";
import {
  etapasParaCliente,
  progressoDasEtapas,
  situacaoParaCliente,
  textoDaPrevisao,
  type EtapaParaCliente,
  type SituacaoParaCliente,
} from "./portal";

/** Teto da lista: o portal mostra o que está aberto e o histórico recente. */
const TETO = 200;

export type ProcessoNoPortal = {
  id: string;
  tipoNome: string;
  titulo: string | null;
  empresaNome: string;
  situacao: SituacaoParaCliente;
  /** Por que está esperando o cliente, suspenso, indeferido ou cancelado. */
  motivo: string | null;
  previsao: string;
  iniciadoEm: Date;
  concluidoEm: Date | null;
  progresso: { feitas: number; total: number };
  exigenciasAbertas: number;
};

const selecaoBase = {
  id: true,
  title: true,
  status: true,
  statusReason: true,
  startedAt: true,
  concludedAt: true,
  company: { select: { name: true, displayName: true } },
  type: { select: { name: true, expectedDaysMin: true, expectedDaysMax: true, variableFlow: true } },
  template: {
    select: { steps: { select: { id: true, position: true, label: true, organ: { select: { name: true, acronym: true } } } } },
  },
  steps: { select: { templateStepId: true, status: true } },
  protocols: {
    select: {
      organId: true,
      attempt: true,
      outcome: true,
      organ: { select: { name: true, acronym: true } },
      requirements: { select: { id: true, description: true, raisedAt: true, dueAt: true, resolvedAt: true } },
    },
  },
} as const;

type Linha = {
  id: string;
  title: string | null;
  status: StatusDoProcesso;
  statusReason: string | null;
  startedAt: Date;
  concludedAt: Date | null;
  company: { name: string; displayName: string | null };
  type: { name: string; expectedDaysMin: number | null; expectedDaysMax: number | null; variableFlow: boolean };
  template: { steps: { id: string; position: number; label: string; organ: { name: string; acronym: string | null } | null }[] };
  steps: { templateStepId: string; status: StatusDaEtapa }[];
  protocols: {
    organId: string;
    attempt: number;
    outcome: "PENDENTE" | "DEFERIDO" | "EXIGENCIA";
    organ: { name: string; acronym: string | null };
    requirements: { id: string; description: string; raisedAt: Date; dueAt: Date | null; resolvedAt: Date | null }[];
  }[];
};

const orgao = (o: { name: string; acronym: string | null }) => o.acronym || o.name;

function etapasDa(p: Linha): EtapaParaCliente[] {
  const status = new Map(p.steps.map((s) => [s.templateStepId, s.status]));
  return p.template.steps.map((s) => ({
    posicao: s.position,
    rotulo: s.label,
    orgao: s.organ ? orgao(s.organ) : null,
    status: status.get(s.id) ?? "PENDENTE",
  }));
}

function resumo(p: Linha, agora: Date, feriados: Set<string>): ProcessoNoPortal {
  const concluido = p.concludedAt !== null;
  return {
    id: p.id,
    tipoNome: p.type.name,
    titulo: p.title,
    empresaNome: nomeExibicao(p.company),
    situacao: situacaoParaCliente(situacaoDoProcesso(p.protocols, concluido, p.status), p.status),
    // O motivo só acompanha as situações marcadas pela equipe; nos demais
    // status a coluna é nula.
    motivo: p.statusReason,
    previsao: textoDaPrevisao(prazoDoProcesso(p.type, p, agora, feriados), concluido),
    iniciadoEm: p.startedAt,
    concluidoEm: p.concludedAt,
    progresso: progressoDasEtapas(etapasDa(p)),
    exigenciasAbertas: p.protocols.reduce((n, pr) => n + pr.requirements.filter((r) => !r.resolvedAt).length, 0),
  };
}

export async function processosDoPortal(
  tenantId: string,
  companyIds: string[],
  agora: Date,
  feriados: Set<string>
): Promise<ProcessoNoPortal[]> {
  if (companyIds.length === 0) return [];
  const linhas = (await getPrisma().process.findMany({
    where: { tenantId, companyId: { in: companyIds } },
    select: selecaoBase,
    orderBy: { startedAt: "desc" },
    take: TETO,
  })) as Linha[];
  return linhas.map((p) => resumo(p, agora, feriados));
}

export type ExigenciaNoPortal = {
  id: string;
  descricao: string;
  orgao: string;
  abertaEm: Date;
  prazo: Date | null;
  resolvidaEm: Date | null;
  processoId: string;
  processoNome: string;
};

export type TaxaNoPortal = { id: string; descricao: string; centavos: number; vencimento: Date | null; pagaEm: Date | null };

export type DetalheNoPortal = ProcessoNoPortal & {
  etapas: EtapaParaCliente[];
  exigencias: ExigenciaNoPortal[];
  taxas: TaxaNoPortal[];
};

function exigenciasDa(p: Linha): ExigenciaNoPortal[] {
  const nome = p.title || p.type.name;
  return p.protocols.flatMap((pr) =>
    pr.requirements.map((r) => ({
      id: r.id,
      descricao: r.description,
      orgao: orgao(pr.organ),
      abertaEm: r.raisedAt,
      prazo: r.dueAt,
      resolvidaEm: r.resolvedAt,
      processoId: p.id,
      processoNome: nome,
    }))
  );
}

/** Aberta primeiro, e entre as abertas a mais antiga — é a que espera há mais tempo. */
function ordenar(exigencias: ExigenciaNoPortal[]): ExigenciaNoPortal[] {
  return [...exigencias].sort((a, b) => {
    if (!a.resolvidaEm !== !b.resolvidaEm) return a.resolvidaEm ? 1 : -1;
    return a.resolvidaEm
      ? b.resolvidaEm!.getTime() - a.resolvidaEm.getTime()
      : a.abertaEm.getTime() - b.abertaEm.getTime();
  });
}

export async function processoDoPortal(
  tenantId: string,
  companyIds: string[],
  id: string,
  agora: Date,
  feriados: Set<string>
): Promise<DetalheNoPortal | null> {
  if (companyIds.length === 0) return null;
  const prisma = getPrisma();
  const p = (await prisma.process.findFirst({
    where: { id, tenantId, companyId: { in: companyIds } },
    select: selecaoBase,
  })) as Linha | null;
  if (!p) return null;

  const taxas = await prisma.processFee.findMany({
    where: { tenantId, processId: p.id, companyId: { in: companyIds } },
    select: { id: true, description: true, amountCents: true, dueDate: true, paidAt: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return {
    ...resumo(p, agora, feriados),
    etapas: etapasParaCliente(etapasDa(p)),
    exigencias: ordenar(exigenciasDa(p)),
    taxas: taxas.map((t) => ({
      id: t.id,
      descricao: t.description,
      centavos: t.amountCents,
      vencimento: t.dueDate,
      pagaEm: t.paidAt,
    })),
  };
}

export async function exigenciasDoPortal(
  tenantId: string,
  companyIds: string[],
  abertas: boolean
): Promise<ExigenciaNoPortal[]> {
  if (companyIds.length === 0) return [];
  const linhas = (await getPrisma().process.findMany({
    where: {
      tenantId,
      companyId: { in: companyIds },
      protocols: { some: { requirements: { some: abertas ? { resolvedAt: null } : { resolvedAt: { not: null } } } } },
    },
    select: selecaoBase,
    orderBy: { startedAt: "desc" },
    take: TETO,
  })) as Linha[];
  return ordenar(linhas.flatMap(exigenciasDa).filter((e) => (abertas ? !e.resolvidaEm : !!e.resolvidaEm)));
}
