// Leituras das visões do Societário: Minha área, Agenda, Exigências, Kanban,
// visão de cliente e Relatórios.
//
// Só consulta e montagem de linha. A regra — faixa de prazo, ordem, SLA — mora
// em `prazos.ts`, `relatorios.ts` e `processo.ts`, que são puras e testadas; se
// alguma decisão aparecer aqui, está no arquivo errado.

import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { custoEmTaxas, type CustoDoProcesso } from "./licencas";
import {
  situacaoDoProcesso,
  prazoDoProcesso,
  totalDeVoltas,
  STATUS_ENCERRADOS,
  STATUS_SEM_CONCLUSAO,
  type SituacaoDoProcesso,
  type Prazo,
} from "./processo";
import { ordenarExigencias, type ItemDePrazo, type SituacaoDaExigencia } from "./prazos";
import type { FiltroDaFila, LinhaDaFila } from "./fila";
import type { ProcessoParaRelatorio } from "./relatorios";
import type { Prioridade } from "./prioridade";

const EMPRESA = { select: { id: true, name: true, displayName: true } } as const;

/** O teto de cada consulta. Uma tela de prazo com mais que isso precisa de filtro. */
const TETO = 500;

const hrefDoCliente = (companyId: string) => `/processos/empresas/${companyId}`;

const sigla = (o: { name: string; acronym: string | null } | null) => (o ? o.acronym || o.name : null);

// ─── Itens de prazo (Minha área e Agenda) ────────────────────────────────────

export type FiltroDePrazos = {
  /**
   * Restringe ao que é de uma pessoa: processos de que ela é responsável, e o
   * que pende deles. Licença não tem dono — entra a das empresas desses
   * processos, que é quem vai precisar renovar.
   */
  responsavelId?: string;
  /** Até quando olhar. Com `ate`, item sem data nunca entra. */
  ate?: Date;
  /** Traz exigência sem prazo do órgão e processo sem prazo combinado. */
  incluirSemData?: boolean;
  /** Licenças vencendo até aqui — inclusive as já vencidas. */
  licencasAte: Date;
};

/**
 * Os prazos em aberto, das quatro fontes, numa lista só.
 *
 * Taxa sem vencimento nunca entra, nem com `incluirSemData`: sem data ela não é
 * prazo, é conta a conferir — e essa conferência mora no processo.
 */
export async function itensDePrazo(tenantId: string, filtro: FiltroDePrazos): Promise<ItemDePrazo[]> {
  const prisma = getPrisma();
  const dono = filtro.responsavelId ? { ownerUserId: filtro.responsavelId } : {};
  const recorteDeData = filtro.ate
    ? { not: null, lte: filtro.ate }
    : filtro.incluirSemData
      ? undefined
      : { not: null };

  const empresasDoDono = filtro.responsavelId
    ? (
        await prisma.process.findMany({
          where: { tenantId, status: { notIn: STATUS_ENCERRADOS }, ownerUserId: filtro.responsavelId },
          select: { companyId: true },
          distinct: ["companyId"],
        })
      ).map((p) => p.companyId)
    : null;

  const [processos, exigencias, taxas, licencas] = await Promise.all([
    prisma.process.findMany({
      where: { tenantId, status: { notIn: STATUS_ENCERRADOS }, ...dono, dueAt: recorteDeData },
      select: {
        id: true,
        title: true,
        dueAt: true,
        company: EMPRESA,
        type: { select: { name: true } },
        owner: { select: { name: true } },
      },
      take: TETO,
    }),
    prisma.processRequirement.findMany({
      where: {
        tenantId,
        resolvedAt: null,
        dueAt: recorteDeData,
        protocol: { process: { tenantId, status: { notIn: STATUS_ENCERRADOS }, ...dono } },
      },
      select: {
        id: true,
        description: true,
        dueAt: true,
        protocol: {
          select: {
            organ: { select: { name: true, acronym: true } },
            process: {
              select: { id: true, company: EMPRESA, type: { select: { name: true } }, owner: { select: { name: true } } },
            },
          },
        },
      },
      take: TETO,
    }),
    prisma.processFee.findMany({
      where: {
        tenantId,
        paidAt: null,
        dueDate: filtro.ate ? { not: null, lte: filtro.ate } : { not: null },
        // Taxa de processo cancelado não é mais prazo de ninguém; a avulsa
        // (sem processo) continua sendo.
        ...(filtro.responsavelId
          ? { process: { ownerUserId: filtro.responsavelId, status: { notIn: STATUS_SEM_CONCLUSAO } } }
          : { OR: [{ processId: null }, { process: { status: { notIn: STATUS_SEM_CONCLUSAO } } }] }),
      },
      select: {
        id: true,
        description: true,
        amountCents: true,
        dueDate: true,
        company: EMPRESA,
        process: { select: { id: true, type: { select: { name: true } }, owner: { select: { name: true } } } },
      },
      take: TETO,
    }),
    empresasDoDono && empresasDoDono.length === 0
      ? Promise.resolve([])
      : prisma.license.findMany({
          where: {
            tenantId,
            revokedAt: null,
            expiresAt: { not: null, lte: filtro.licencasAte },
            ...(empresasDoDono ? { companyId: { in: empresasDoDono } } : {}),
          },
          select: {
            id: true,
            kind: true,
            number: true,
            expiresAt: true,
            company: EMPRESA,
            organ: { select: { name: true, acronym: true } },
          },
          take: TETO,
        }),
  ]);

  const itens: ItemDePrazo[] = [
    ...processos.map(
      (p): ItemDePrazo => ({
        chave: `processo:${p.id}`,
        tipo: "processo",
        data: p.dueAt,
        titulo: p.title ? `${p.type.name} — ${p.title}` : p.type.name,
        detalhe: p.dueAt ? null : "Sem prazo combinado",
        empresaId: p.company.id,
        empresaNome: nomeExibicao(p.company),
        responsavelNome: p.owner?.name ?? null,
        href: `/processos/${p.id}`,
        valorCentavos: null,
      })
    ),
    ...exigencias.map(
      (e): ItemDePrazo => ({
        chave: `exigencia:${e.id}`,
        tipo: "exigencia",
        data: e.dueAt,
        titulo: e.description,
        detalhe: [sigla(e.protocol.organ), e.protocol.process.type.name, e.dueAt ? null : "sem prazo do órgão"]
          .filter(Boolean)
          .join(" · "),
        empresaId: e.protocol.process.company.id,
        empresaNome: nomeExibicao(e.protocol.process.company),
        responsavelNome: e.protocol.process.owner?.name ?? null,
        href: `/processos/${e.protocol.process.id}`,
        valorCentavos: null,
      })
    ),
    ...taxas.map(
      (t): ItemDePrazo => ({
        chave: `taxa:${t.id}`,
        tipo: "taxa",
        data: t.dueDate,
        titulo: t.description,
        detalhe: t.process?.type.name ?? "Taxa avulsa",
        empresaId: t.company.id,
        empresaNome: nomeExibicao(t.company),
        responsavelNome: t.process?.owner?.name ?? null,
        href: t.process ? `/processos/${t.process.id}` : hrefDoCliente(t.company.id),
        valorCentavos: t.amountCents,
      })
    ),
    ...licencas.map(
      (l): ItemDePrazo => ({
        chave: `licenca:${l.id}`,
        tipo: "licenca",
        data: l.expiresAt,
        titulo: l.number ? `${l.kind} nº ${l.number}` : l.kind,
        detalhe: sigla(l.organ),
        empresaId: l.company.id,
        empresaNome: nomeExibicao(l.company),
        responsavelNome: null,
        href: hrefDoCliente(l.company.id),
        valorCentavos: null,
      })
    ),
  ];

  return itens.sort((a, b) => {
    if (a.data && b.data) return a.data.getTime() - b.data.getTime();
    return Number(a.data === null) - Number(b.data === null);
  });
}

// ─── Exigências ──────────────────────────────────────────────────────────────

export type LinhaDeExigencia = {
  id: string;
  descricao: string;
  raisedAt: Date;
  dueAt: Date | null;
  resolvedAt: Date | null;
  processoId: string;
  /** Exigência de processo encerrado é histórico: não se resolve pela lista. */
  processoAberto: boolean;
  tipoNome: string;
  tituloDoProcesso: string | null;
  empresaId: string;
  empresaNome: string;
  orgaoNome: string;
  tentativa: number;
  responsavelNome: string | null;
};

export async function listarExigencias(
  tenantId: string,
  filtro: { situacao: SituacaoDaExigencia; responsavelId?: string }
): Promise<LinhaDeExigencia[]> {
  const prisma = getPrisma();
  const linhas = await prisma.processRequirement.findMany({
    where: {
      tenantId,
      resolvedAt: filtro.situacao === "abertas" ? null : filtro.situacao === "resolvidas" ? { not: null } : undefined,
      protocol: {
        process: {
          tenantId,
          status: { notIn: STATUS_SEM_CONCLUSAO },
          ownerUserId: filtro.responsavelId === "nenhum" ? null : filtro.responsavelId || undefined,
        },
      },
    },
    select: {
      id: true,
      description: true,
      raisedAt: true,
      dueAt: true,
      resolvedAt: true,
      protocol: {
        select: {
          attempt: true,
          organ: { select: { name: true, acronym: true } },
          process: {
            select: {
              id: true,
              title: true,
              concludedAt: true,
              company: EMPRESA,
              type: { select: { name: true } },
              owner: { select: { name: true } },
            },
          },
        },
      },
    },
    // Com o teto, quem cai fora é a mais antiga — que em "todas" é a resolvida
    // de meses atrás, e não a aberta de hoje.
    orderBy: { raisedAt: "desc" },
    take: TETO,
  });

  return ordenarExigencias(
    linhas.map((r) => ({
      id: r.id,
      descricao: r.description,
      raisedAt: r.raisedAt,
      dueAt: r.dueAt,
      resolvedAt: r.resolvedAt,
      processoId: r.protocol.process.id,
      processoAberto: r.protocol.process.concludedAt === null,
      tipoNome: r.protocol.process.type.name,
      tituloDoProcesso: r.protocol.process.title,
      empresaId: r.protocol.process.company.id,
      empresaNome: nomeExibicao(r.protocol.process.company),
      orgaoNome: sigla(r.protocol.organ)!,
      tentativa: r.protocol.attempt,
      responsavelNome: r.protocol.process.owner?.name ?? null,
    }))
  );
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

/**
 * Os concluídos dos últimos dias, no formato da fila — para a última coluna do
 * kanban. A fila (`listarFila`) só traz abertos, e é assim que deve continuar.
 */
export async function listarConcluidosRecentes(
  tenantId: string,
  filtro: FiltroDaFila,
  feriados: Set<string>,
  agora: Date,
  dias: number
): Promise<LinhaDaFila[]> {
  const prisma = getPrisma();
  const processos = await prisma.process.findMany({
    where: {
      tenantId,
      status: "CONCLUIDO",
      concludedAt: { gte: new Date(agora.getTime() - dias * 86_400_000) },
      companyId: filtro.empresaId || undefined,
      typeId: filtro.tipoId || undefined,
      ownerUserId: filtro.responsavelId === "nenhum" ? null : filtro.responsavelId || undefined,
      priority: filtro.prioridade || undefined,
    },
    select: {
      id: true,
      startedAt: true,
      concludedAt: true,
      ownerUserId: true,
      title: true,
      priority: true,
      dueAt: true,
      company: EMPRESA,
      owner: { select: { name: true } },
      type: { select: { name: true, expectedDaysMin: true, expectedDaysMax: true, variableFlow: true } },
      protocols: { select: { organId: true, attempt: true, outcome: true } },
    },
    orderBy: { concludedAt: "desc" },
    take: 100,
  });

  return processos.map((p) => ({
    id: p.id,
    tipoNome: p.type.name,
    empresaId: p.company.id,
    empresaNome: nomeExibicao(p.company),
    responsavelNome: p.owner?.name ?? null,
    responsavelId: p.ownerUserId,
    titulo: p.title,
    prioridade: p.priority,
    prazoCombinado: p.dueAt,
    situacao: "CONCLUIDO",
    prazo: prazoDoProcesso(p.type, p, agora, feriados),
    voltas: totalDeVoltas(p.protocols),
    etapasAgora: [],
    iniciadoEm: p.startedAt,
  }));
}

// ─── Visão de cliente ────────────────────────────────────────────────────────

export type ProcessoDoCliente = {
  id: string;
  tipoNome: string;
  titulo: string | null;
  situacao: SituacaoDoProcesso;
  /** Encerrado sem conclusão: cancelado ou indeferido. */
  cancelado: boolean;
  encerradoComo: "CANCELADO" | "INDEFERIDO" | null;
  prazo: Prazo;
  voltas: number;
  prioridade: Prioridade;
  responsavelNome: string | null;
  iniciadoEm: Date;
  concluidoEm: Date | null;
  prazoCombinado: Date | null;
};

export type ExigenciaDoCliente = {
  id: string;
  descricao: string;
  raisedAt: Date;
  dueAt: Date | null;
  resolvedAt: Date | null;
  processoId: string;
  tipoNome: string;
  orgaoNome: string;
  tentativa: number;
};

export type TaxaDoCliente = {
  id: string;
  descricao: string;
  amountCents: number;
  dueDate: Date | null;
  paidAt: Date | null;
  processoId: string | null;
  tipoNome: string | null;
  attempt: number | null;
};

export type VisaoDoCliente = {
  empresa: { id: string; nome: string; razaoSocial: string };
  abertos: ProcessoDoCliente[];
  encerrados: ProcessoDoCliente[];
  exigencias: ExigenciaDoCliente[];
  taxas: TaxaDoCliente[];
  custo: CustoDoProcesso;
};

export async function visaoDoCliente(
  tenantId: string,
  companyId: string,
  agora: Date,
  feriados: Set<string>
): Promise<VisaoDoCliente | null> {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { id: companyId, tenantId },
    select: { id: true, name: true, displayName: true },
  });
  if (!empresa) return null;

  const [processos, taxas] = await Promise.all([
    prisma.process.findMany({
      where: { tenantId, companyId },
      select: {
        id: true,
        title: true,
        status: true,
        startedAt: true,
        concludedAt: true,
        priority: true,
        dueAt: true,
        owner: { select: { name: true } },
        type: { select: { name: true, expectedDaysMin: true, expectedDaysMax: true, variableFlow: true } },
        protocols: {
          select: {
            organId: true,
            attempt: true,
            outcome: true,
            organ: { select: { name: true, acronym: true } },
            requirements: { select: { id: true, description: true, raisedAt: true, dueAt: true, resolvedAt: true } },
          },
        },
      },
      orderBy: { startedAt: "desc" },
      take: 200,
    }),
    prisma.processFee.findMany({
      where: { tenantId, companyId },
      select: {
        id: true,
        description: true,
        amountCents: true,
        dueDate: true,
        paidAt: true,
        processId: true,
        protocol: { select: { attempt: true } },
        process: { select: { type: { select: { name: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: TETO,
    }),
  ]);

  const linhas: ProcessoDoCliente[] = processos.map((p) => ({
    id: p.id,
    tipoNome: p.type.name,
    titulo: p.title,
    situacao: situacaoDoProcesso(p.protocols, p.concludedAt !== null, p.status),
    cancelado: STATUS_SEM_CONCLUSAO.includes(p.status),
    encerradoComo: p.status === "CANCELADO" || p.status === "INDEFERIDO" ? p.status : null,
    prazo: prazoDoProcesso(p.type, p, agora, feriados),
    voltas: totalDeVoltas(p.protocols),
    prioridade: p.priority,
    responsavelNome: p.owner?.name ?? null,
    iniciadoEm: p.startedAt,
    concluidoEm: p.concludedAt,
    prazoCombinado: p.dueAt,
  }));

  const exigencias = ordenarExigencias(
    processos.flatMap((p) =>
      p.protocols.flatMap((pr) =>
        pr.requirements.map((r) => ({
          id: r.id,
          descricao: r.description,
          raisedAt: r.raisedAt,
          dueAt: r.dueAt,
          resolvedAt: r.resolvedAt,
          processoId: p.id,
          tipoNome: p.type.name,
          orgaoNome: sigla(pr.organ)!,
          tentativa: pr.attempt,
        }))
      )
    )
  );

  const taxasDoCliente: TaxaDoCliente[] = taxas.map((t) => ({
    id: t.id,
    descricao: t.description,
    amountCents: t.amountCents,
    dueDate: t.dueDate,
    paidAt: t.paidAt,
    processoId: t.processId,
    tipoNome: t.process?.type.name ?? null,
    attempt: t.protocol?.attempt ?? null,
  }));

  return {
    empresa: { id: empresa.id, nome: nomeExibicao(empresa), razaoSocial: empresa.name },
    // Cancelado vai para encerrados mesmo sem `concludedAt`: não é trabalho aberto.
    abertos: linhas.filter((l) => l.concluidoEm === null && !l.cancelado),
    encerrados: linhas.filter((l) => l.concluidoEm !== null || l.cancelado),
    exigencias,
    taxas: taxasDoCliente,
    custo: custoEmTaxas(taxasDoCliente),
  };
}

// ─── Relatórios ──────────────────────────────────────────────────────────────

/**
 * A base dos relatórios: todo processo aberto agora, mais os concluídos desde
 * `inicio`. Cancelado fica fora — não teve prazo cumprido nem estourado.
 */
export async function processosParaRelatorio(
  tenantId: string,
  inicio: Date,
  agora: Date,
  feriados: Set<string>
): Promise<ProcessoParaRelatorio[]> {
  const prisma = getPrisma();
  const processos = await prisma.process.findMany({
    where: {
      tenantId,
      OR: [
        { status: { notIn: STATUS_ENCERRADOS } },
        { status: "CONCLUIDO", concludedAt: { gte: inicio } },
      ],
    },
    select: {
      id: true,
      typeId: true,
      startedAt: true,
      concludedAt: true,
      ownerUserId: true,
      company: EMPRESA,
      owner: { select: { name: true } },
      type: { select: { name: true, expectedDaysMin: true, expectedDaysMax: true, variableFlow: true } },
      protocols: { select: { organId: true, attempt: true, outcome: true } },
      fees: { select: { amountCents: true, paidAt: true, protocol: { select: { attempt: true } } } },
    },
    take: 2000,
  });

  return processos.map((p) => ({
    id: p.id,
    tipoId: p.typeId,
    tipoNome: p.type.name,
    empresaNome: nomeExibicao(p.company),
    responsavelId: p.ownerUserId,
    responsavelNome: p.owner?.name ?? null,
    prazo: prazoDoProcesso(p.type, p, agora, feriados),
    voltas: totalDeVoltas(p.protocols),
    concluidoEm: p.concludedAt,
    taxas: p.fees.map((f) => ({ amountCents: f.amountCents, paidAt: f.paidAt, attempt: f.protocol?.attempt ?? null })),
  }));
}
