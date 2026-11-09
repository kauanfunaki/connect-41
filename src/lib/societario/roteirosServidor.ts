// O que as telas de roteiro leem do banco (09/11/2026). A regra — leitura,
// validação e as operações do editor — mora em `roteiroEditavel.ts`, que é puro
// e entra no componente de cliente; este arquivo usa o Prisma e só roda no
// servidor.

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { normalizarRoteiro, type EtapaDoRoteiro, type OrgaoDoRoteiro } from "./roteiroEditavel";

/** A ação da auditoria que a publicação grava — é dela que sai "quem salvou" cada versão. */
export const ACAO_DA_PUBLICACAO = "societario.roteiro.publicado";

/** Processo nestes status não anda mais: não conta como "em andamento" na versão. */
const ENCERRADOS = ["CONCLUIDO", "CANCELADO", "INDEFERIDO"] as const;
const EM_ANDAMENTO = { status: { notIn: [...ENCERRADOS] } };

/**
 * As etapas de uma versão, na forma do editor. A ordem dentro de uma posição
 * (as paralelas) segue a gravação: a publicação grava cada etapa com um
 * `createdAt` à frente da anterior para isto.
 */
export async function etapasDaVersao(db: Pick<Prisma.TransactionClient, "processTemplateStep">, templateId: string): Promise<EtapaDoRoteiro[]> {
  const passos = await db.processTemplateStep.findMany({
    where: { templateId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      position: true,
      label: true,
      description: true,
      parallelGroup: true,
      optional: true,
      organId: true,
      expectedActor: true,
      items: { orderBy: { position: "asc" }, select: { label: true, required: true } },
    },
  });
  return normalizarRoteiro(
    passos.map((p) => ({
      posicao: p.position,
      rotulo: p.label,
      descricao: p.description,
      grupo: p.parallelGroup,
      opcional: p.optional,
      orgaoId: p.organId,
      executor: p.expectedActor,
      itens: p.items.map((i) => ({ rotulo: i.label, obrigatorio: i.required })),
    }))
  );
}

/** Quem publicou cada versão, pela auditoria. Versão gravada por script não tem linha — fica fora do mapa. */
async function autoresDasVersoes(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const linhas = await getPrisma().auditLog.findMany({
    where: { tenantId, action: ACAO_DA_PUBLICACAO, entityType: "ProcessTemplate", entityId: { in: ids } },
    select: { entityId: true, actorName: true },
  });
  return new Map(linhas.filter((l) => l.entityId).map((l) => [l.entityId!, l.actorName ?? "—"]));
}

export type TipoNaListaDeRoteiros = {
  id: string;
  nome: string;
  ativo: boolean;
  /** A versão em vigor; nulo quando o tipo ainda não tem roteiro publicado. */
  versao: { numero: number; etapas: number; publicadaEm: Date; autor: string | null } | null;
  emAndamento: number;
};

/** A lista de `/processos/roteiros`: um tipo por linha, os ativos primeiro. */
export async function listarRoteiros(tenantId: string): Promise<TipoNaListaDeRoteiros[]> {
  const tipos = await getPrisma().processType.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      active: true,
      templates: {
        where: { published: true },
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true, version: true, createdAt: true, _count: { select: { steps: true } } },
      },
      _count: { select: { processes: { where: EM_ANDAMENTO } } },
    },
  });
  const autores = await autoresDasVersoes(
    tenantId,
    tipos.flatMap((t) => t.templates.map((v) => v.id))
  );
  return tipos.map((t) => {
    const v = t.templates[0];
    return {
      id: t.id,
      nome: t.name,
      ativo: t.active,
      versao: v ? { numero: v.version, etapas: v._count.steps, publicadaEm: v.createdAt, autor: autores.get(v.id) ?? null } : null,
      emAndamento: t._count.processes,
    };
  });
}

export type VersaoDoRoteiro = {
  id: string;
  numero: number;
  vigente: boolean;
  criadaEm: Date;
  /** Quem publicou pela tela; nulo na versão gravada por script. */
  autor: string | null;
  etapas: number;
  emAndamento: number;
};

export type RoteiroNoEditor = {
  tipo: { id: string; nome: string; ativo: boolean };
  /** A maior versão do tipo, publicada ou não — a publicação confere que ninguém gravou outra no meio. */
  versaoBase: number;
  vigente: { numero: number; desde: Date; etapas: EtapaDoRoteiro[] } | null;
  orgaos: OrgaoDoRoteiro[];
  historico: VersaoDoRoteiro[];
};

/** Até onde o histórico vai. Um roteiro com mais versões que isto mostra as mais novas. */
const VERSOES_NO_HISTORICO = 50;

/** Tudo o que a tela do roteiro de um tipo precisa, ou nulo se o tipo não é deste escritório. */
export async function carregarRoteiro(tenantId: string, tipoId: string): Promise<RoteiroNoEditor | null> {
  const prisma = getPrisma();
  const tipo = await prisma.processType.findFirst({ where: { id: tipoId, tenantId }, select: { id: true, name: true, active: true } });
  if (!tipo) return null;

  const [versoes, orgaos] = await Promise.all([
    prisma.processTemplate.findMany({
      where: { tenantId, typeId: tipo.id },
      orderBy: { version: "desc" },
      take: VERSOES_NO_HISTORICO,
      select: {
        id: true,
        version: true,
        published: true,
        createdAt: true,
        _count: { select: { steps: true, processes: { where: EM_ANDAMENTO } } },
      },
    }),
    prisma.processOrgan.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, acronym: true, active: true },
    }),
  ]);

  // Vigente é a publicada mais nova — a mesma que a abertura de processo usa.
  const vigente = versoes.find((v) => v.published) ?? null;
  const [etapas, autores] = await Promise.all([
    vigente ? etapasDaVersao(prisma, vigente.id) : Promise.resolve([]),
    autoresDasVersoes(tenantId, versoes.map((v) => v.id)),
  ]);

  return {
    tipo: { id: tipo.id, nome: tipo.name, ativo: tipo.active },
    versaoBase: versoes[0]?.version ?? 0,
    vigente: vigente ? { numero: vigente.version, desde: vigente.createdAt, etapas } : null,
    orgaos: orgaos.map((o) => ({ id: o.id, nome: o.name, sigla: o.acronym, ativo: o.active })),
    historico: versoes.map((v) => ({
      id: v.id,
      numero: v.version,
      vigente: v.id === vigente?.id,
      criadaEm: v.createdAt,
      autor: autores.get(v.id) ?? null,
      etapas: v._count.steps,
      emAndamento: v._count.processes,
    })),
  };
}
