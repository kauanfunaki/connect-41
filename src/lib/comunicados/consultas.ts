// Leitura dos comunicados: a lista da equipe (com quantos clientes leram), o
// detalhe com a leitura por cliente, e o lado do cliente (os do grupo dele).

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AnexoDaConversa } from "@/lib/financeiro/pendencias/consultas";
import { resumoDaLeitura, type LeituraDoGrupo, type Publico } from "./regras";

/** Os clientes (grupos) que o público alcança, no momento do envio. */
export async function gruposDoPublico(tenantId: string, publico: Publico, setor: string, escolhidos: string[]): Promise<string[]> {
  const prisma = getPrisma();
  const ativos: Prisma.ClientGroupWhereInput = { tenantId, active: true };
  const where: Prisma.ClientGroupWhereInput =
    publico === "TODOS"
      ? ativos
      : publico === "ESCOLHIDOS"
        ? { ...ativos, id: { in: escolhidos } }
        : { ...ativos, companies: { some: { services: { some: { sectorCode: setor, status: "ACTIVE" } } } } };
  return (await prisma.clientGroup.findMany({ where, select: { id: true } })).map((g) => g.id);
}

export type LinhaDoComunicado = {
  id: string;
  titulo: string;
  setor: string;
  enviadoEm: Date;
  enviadoPor: string | null;
  clientes: number;
  leram: number;
  avisosEnviados: boolean;
};

/** A lista da equipe: os comunicados dos setores da pessoa (`null` = todos). */
export async function listarComunicados(tenantId: string, setores: string[] | null): Promise<LinhaDoComunicado[]> {
  const prisma = getPrisma();
  const lista = await prisma.clientAnnouncement.findMany({
    where: { tenantId, ...(setores ? { sectorCode: { in: setores } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      sectorCode: true,
      createdAt: true,
      notifiedAt: true,
      createdBy: { select: { name: true } },
      groups: { select: { clientGroupId: true } },
      reads: { select: { portalUser: { select: { clientGroupId: true } } } },
    },
  });
  return lista.map((c) => {
    const comLeitura = new Set(c.reads.map((r) => r.portalUser.clientGroupId));
    return {
      id: c.id,
      titulo: c.title,
      setor: c.sectorCode,
      enviadoEm: c.createdAt,
      enviadoPor: c.createdBy?.name ?? null,
      clientes: c.groups.length,
      leram: c.groups.filter((g) => comLeitura.has(g.clientGroupId)).length,
      avisosEnviados: c.notifiedAt !== null,
    };
  });
}

export type ComunicadoDaEquipe = {
  id: string;
  titulo: string;
  texto: string;
  setor: string;
  enviadoEm: Date;
  enviadoPor: string | null;
  avisosEnviadosEm: Date | null;
  anexos: AnexoDaConversa[];
  grupos: LeituraDoGrupo[];
  resumo: { clientes: number; leram: number };
};

/** O comunicado com a leitura cliente a cliente — quem leu primeiro e quando. */
export async function carregarComunicado(tenantId: string, id: string): Promise<ComunicadoDaEquipe | null> {
  const c = await getPrisma().clientAnnouncement.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      title: true,
      body: true,
      sectorCode: true,
      createdAt: true,
      notifiedAt: true,
      createdBy: { select: { name: true } },
      attachments: { select: { id: true, fileName: true, sizeBytes: true }, orderBy: { createdAt: "asc" } },
      groups: { select: { clientGroup: { select: { id: true, name: true } } } },
      reads: { select: { readAt: true, portalUser: { select: { name: true, clientGroupId: true } } }, orderBy: { readAt: "asc" } },
    },
  });
  if (!c) return null;
  const grupos: LeituraDoGrupo[] = c.groups
    .map((g) => ({
      grupoId: g.clientGroup.id,
      nome: g.clientGroup.name,
      leitores: c.reads
        .filter((r) => r.portalUser.clientGroupId === g.clientGroup.id)
        .map((r) => ({ nome: r.portalUser.name, em: r.readAt })),
    }))
    // Quem não leu primeiro: é a lista que alguém vai cobrar.
    .sort((a, b) => Number(a.leitores.length > 0) - Number(b.leitores.length > 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    id: c.id,
    titulo: c.title,
    texto: c.body,
    setor: c.sectorCode,
    enviadoEm: c.createdAt,
    enviadoPor: c.createdBy?.name ?? null,
    avisosEnviadosEm: c.notifiedAt,
    anexos: c.attachments,
    grupos,
    resumo: resumoDaLeitura(grupos),
  };
}

// ─── Lado do cliente ─────────────────────────────────────────────────────────

export type ComunicadoDoCliente = {
  id: string;
  titulo: string;
  setor: string;
  enviadoEm: Date;
  lido: boolean;
};

/** Os comunicados do grupo do cliente, o mais novo primeiro, com o "lido" deste usuário. */
export async function comunicadosDoCliente(tenantId: string, clientGroupId: string, portalUserId: string): Promise<ComunicadoDoCliente[]> {
  const lista = await getPrisma().clientAnnouncement.findMany({
    where: { tenantId, groups: { some: { clientGroupId } } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, title: true, sectorCode: true, createdAt: true, reads: { where: { portalUserId }, select: { id: true } } },
  });
  return lista.map((c) => ({ id: c.id, titulo: c.title, setor: c.sectorCode, enviadoEm: c.createdAt, lido: c.reads.length > 0 }));
}

/** Quantos o usuário ainda não abriu — o aviso da home do portal. */
export async function comunicadosNaoLidos(tenantId: string, clientGroupId: string, portalUserId: string): Promise<number> {
  return getPrisma().clientAnnouncement.count({
    where: { tenantId, groups: { some: { clientGroupId } }, reads: { none: { portalUserId } } },
  });
}

/** Um comunicado do grupo do cliente — e registra a leitura, na primeira vez. */
export async function abrirComunicadoDoCliente(tenantId: string, clientGroupId: string, portalUserId: string, id: string) {
  const prisma = getPrisma();
  const c = await prisma.clientAnnouncement.findFirst({
    where: { id, tenantId, groups: { some: { clientGroupId } } },
    select: {
      id: true,
      title: true,
      body: true,
      sectorCode: true,
      createdAt: true,
      attachments: { select: { id: true, fileName: true, sizeBytes: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!c) return null;
  // `upsert` com update vazio: a primeira leitura é a que vale, e abrir de novo
  // não muda o "leu em".
  await prisma.clientAnnouncementRead.upsert({
    where: { announcementId_portalUserId: { announcementId: c.id, portalUserId } },
    create: { announcementId: c.id, portalUserId },
    update: {},
  });
  return { id: c.id, titulo: c.title, texto: c.body, setor: c.sectorCode, enviadoEm: c.createdAt, anexos: c.attachments };
}
