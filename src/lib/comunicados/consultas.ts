// Leitura dos comunicados: a lista da equipe (com quantas empresas leram), o
// detalhe com a leitura por empresa, e o lado do cliente (os das empresas do
// acesso dele).
//
// Desde 14/10/2026 o comunicado vai para empresas (`ClientAnnouncementCompany`),
// e não mais para Clientes; os antigos foram copiados para as empresas dos
// clientes que os receberam (migration 20261014210000). A volta para os
// Clientes, sem a tabela nova, saiu em 21/10/2026 com o Cliente (etapa 3).

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { nomeExibicao } from "@/lib/companyName";
import { STATUS_OCULTOS_POR_PADRAO } from "@/lib/companyStatusFilter";
import { lerContasDasEmpresas } from "@/lib/portal/empresasDaContaDb";
import type { AnexoDaConversa } from "@/lib/financeiro/pendencias/consultas";
import { empresasQueLeram, resumoDaLeitura, type LeituraDaEmpresa, type Publico } from "./regras";

/** As empresas em operação — o "todas" e o "do setor" não mandam para empresa inativa ou cancelada. */
const EM_OPERACAO = { status: { notIn: STATUS_OCULTOS_POR_PADRAO } } as const;

/** O `where` das empresas que o público alcança. */
export function whereDoPublico(tenantId: string, publico: Publico, setor: string, escolhidas: string[]): Prisma.CompanyWhereInput {
  if (publico === "TODOS") return { tenantId, ...EM_OPERACAO };
  // Escolhida a dedo vale qualquer que seja o status — foi uma decisão de quem mandou.
  if (publico === "ESCOLHIDOS") return { tenantId, id: { in: escolhidas } };
  return { tenantId, ...EM_OPERACAO, services: { some: { sectorCode: setor, status: "ACTIVE" } } };
}

/** As empresas que o público alcança, no momento do envio. Só do escritório: id de outro não volta. */
export async function empresasDoPublico(tenantId: string, publico: Publico, setor: string, escolhidas: string[]): Promise<string[]> {
  const empresas = await getPrisma().company.findMany({ where: whereDoPublico(tenantId, publico, setor, escolhidas), select: { id: true } });
  return empresas.map((e) => e.id);
}

/** Quem recebeu: a empresa (ou, antes da migration, o cliente) e as contas que a enxergam. */
type Destinatario = { id: string; nome: string; contas: Set<string> };

/**
 * Os destinatários de cada comunicado, com as contas do portal que enxergam
 * cada um hoje.
 */
async function destinatariosDosComunicados(tenantId: string, ids: string[]): Promise<Map<string, Destinatario[]>> {
  const saida = new Map<string, Destinatario[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return saida;
  const prisma = getPrisma();
  const linhas = await prisma.clientAnnouncementCompany.findMany({
    where: { announcementId: { in: ids } },
    select: { announcementId: true, company: { select: { id: true, name: true, displayName: true, tenantId: true } } },
  });
  const doEscritorio = linhas.filter((l) => l.company.tenantId === tenantId);
  const contas = await lerContasDasEmpresas(tenantId, [...new Set(doEscritorio.map((l) => l.company.id))]);
  for (const l of doEscritorio) {
    saida.get(l.announcementId)?.push({
      id: l.company.id,
      nome: nomeExibicao(l.company),
      contas: new Set(contas.get(l.company.id)?.keys() ?? []),
    });
  }
  return saida;
}

export type LinhaDoComunicado = {
  id: string;
  titulo: string;
  setor: string;
  enviadoEm: Date;
  enviadoPor: string | null;
  empresas: number;
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
      reads: { select: { portalUserId: true } },
    },
  });
  const destinatarios = await destinatariosDosComunicados(
    tenantId,
    lista.map((c) => c.id)
  );
  return lista.map((c) => {
    const destinos = destinatarios.get(c.id) ?? [];
    return {
      id: c.id,
      titulo: c.title,
      setor: c.sectorCode,
      enviadoEm: c.createdAt,
      enviadoPor: c.createdBy?.name ?? null,
      empresas: destinos.length,
      leram: empresasQueLeram(
        destinos.map((d) => d.id),
        new Map(destinos.map((d) => [d.id, d.contas])),
        new Set(c.reads.map((r) => r.portalUserId))
      ),
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
  empresas: LeituraDaEmpresa[];
  resumo: { empresas: number; leram: number };
};

/** O comunicado com a leitura empresa a empresa — quem leu primeiro e quando. */
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
      reads: { select: { readAt: true, portalUserId: true, portalUser: { select: { name: true } } }, orderBy: { readAt: "asc" } },
    },
  });
  if (!c) return null;
  const destinos = (await destinatariosDosComunicados(tenantId, [c.id])).get(c.id) ?? [];
  const empresas: LeituraDaEmpresa[] = destinos
    .map((d) => ({
      empresaId: d.id,
      nome: d.nome,
      leitores: c.reads.filter((r) => d.contas.has(r.portalUserId)).map((r) => ({ nome: r.portalUser.name, em: r.readAt })),
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
    empresas,
    resumo: resumoDaLeitura(empresas),
  };
}

// ─── Lado do cliente ─────────────────────────────────────────────────────────
//
// O cliente vê o comunicado que foi para alguma das empresas do acesso dele
// (`alcanceDoCliente`). Sem empresa, não vê nenhum — nunca todos.

/** Os comunicados que foram para alguma das empresas. */
export function paraAsEmpresas(companyIds: string[]): Prisma.ClientAnnouncementWhereInput {
  return { companies: { some: { companyId: { in: companyIds } } } };
}

export type ComunicadoDoCliente = {
  id: string;
  titulo: string;
  setor: string;
  enviadoEm: Date;
  lido: boolean;
};

/** Os comunicados das empresas do cliente, o mais novo primeiro, com o "lido" deste usuário. */
export async function comunicadosDoCliente(tenantId: string, companyIds: string[], portalUserId: string): Promise<ComunicadoDoCliente[]> {
  if (companyIds.length === 0) return [];
  const lista = await getPrisma().clientAnnouncement.findMany({
    where: { tenantId, ...paraAsEmpresas(companyIds) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, title: true, sectorCode: true, createdAt: true, reads: { where: { portalUserId }, select: { id: true } } },
  });
  return lista.map((c) => ({ id: c.id, titulo: c.title, setor: c.sectorCode, enviadoEm: c.createdAt, lido: c.reads.length > 0 }));
}

/** Quantos o usuário ainda não abriu — o aviso da home do portal. */
export async function comunicadosNaoLidos(tenantId: string, companyIds: string[], portalUserId: string): Promise<number> {
  if (companyIds.length === 0) return 0;
  return getPrisma().clientAnnouncement.count({ where: { tenantId, ...paraAsEmpresas(companyIds), reads: { none: { portalUserId } } } });
}

/** Um comunicado das empresas do cliente — e registra a leitura, na primeira vez. */
export async function abrirComunicadoDoCliente(tenantId: string, companyIds: string[], portalUserId: string, id: string) {
  if (companyIds.length === 0) return null;
  const prisma = getPrisma();
  const c = await prisma.clientAnnouncement.findFirst({
    where: { id, tenantId, ...paraAsEmpresas(companyIds) },
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

/** O anexo de um comunicado das empresas do cliente — e só se for. */
export async function anexoDoComunicadoDoCliente(tenantId: string, companyIds: string[], anexoId: string) {
  if (companyIds.length === 0) return null;
  return getPrisma().clientAnnouncementAttachment.findFirst({
    where: { id: anexoId, announcement: { tenantId, ...paraAsEmpresas(companyIds) } },
    select: { fileName: true, fileUrl: true, mimeType: true },
  });
}
