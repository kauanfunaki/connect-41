// "Do Connect": os anexos que já existem nos módulos, para cada empresa, numa
// pasta só de leitura dos Arquivos (09/10/2026).
//
// Nada é copiado nem movido: cada linha é o anexo onde ele mora (a solicitação,
// a pendência, o processo...), listado aqui e baixado pela rota de download do
// próprio módulo. Por isso a régua de quem vê cada origem é a MESMA da rota de
// download dela — listar o que a pessoa não consegue baixar seria pior que não
// listar. Quando uma rota muda a régua, esta lista acompanha.
//
// Para organizar, "Guardar numa pasta" copia o arquivo para uma pasta de
// verdade dos Arquivos (`lerDoConnect` + `guardarArquivo`).

import { getPrisma } from "@/lib/prisma";
import { canActOnSector, canViewSector, type AuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { grupoSensivelDoDocumento, lerArquivoDoDocumentoDaFicha } from "@/lib/documents";
import { podeVerSolicitacao } from "@/lib/solicitacoes/acesso";
import { anexosDaSolicitacao } from "@/lib/solicitacoes/armazenamento";
import { lerAnexo as lerAnexoDaPendencia } from "@/lib/financeiro/pendencias/armazenamento";
import { arquivosDoProcesso } from "@/lib/societario/conversa";
import { lerArquivoDoDocumento } from "@/lib/clientDocuments";
import { anexosDaConversa } from "@/lib/financeiro/comunicacao/armazenamento";
import { temPrevia } from "./servidor";

export const ORIGENS_DO_CONNECT = ["documentos", "solicitacoes", "pendencias", "processos", "envios", "conversa"] as const;
export type OrigemDoConnect = (typeof ORIGENS_DO_CONNECT)[number];

export const ROTULO_DA_ORIGEM: Record<OrigemDoConnect, string> = {
  documentos: "Documentos da ficha",
  solicitacoes: "Solicitações",
  pendencias: "Pendências",
  processos: "Processos do Societário",
  envios: "Envios ao cliente",
  conversa: "Conversa",
};

export type ItemDoConnect = {
  origem: OrigemDoConnect;
  id: string;
  nome: string;
  tamanho: number | null;
  enviadoEm: string;
  enviadoPor: string | null;
  peloCliente: boolean;
  /** Onde ele está: "Solicitação nº 12 · Alteração contratual". */
  contexto: string;
  /** A rota de download do módulo, que confere o acesso de novo. */
  baixar: string;
  /** A tela do módulo onde o anexo vive, quando há uma. */
  abrirNaOrigem: string | null;
  previa: boolean;
};

export type GrupoDoConnect = { origem: OrigemDoConnect; rotulo: string; itens: ItemDoConnect[] };

/** O setor que opera um módulo neste escritório (ou o do catálogo). */
async function setorDe(tenantId: string, modulo: string): Promise<string> {
  return (await setorDoModulo(tenantId, modulo)) ?? getModuleDef(modulo)?.sectorCode ?? modulo;
}

/** O que cada origem permite a quem pede — o mesmo que a rota de download dela confere. */
async function origensAoAlcance(ctx: AuthContext): Promise<Set<OrigemDoConnect>> {
  const t = ctx.tenantId;
  const [solicitacoes, pendencias, processos, conversa] = await Promise.all([
    isModuleEnabled(t, "portal_solicitacoes"),
    isModuleEnabled(t, "bpo_pendencias"),
    isModuleEnabled(t, "societario_processos"),
    isModuleEnabled(t, "bpo_comunicacao"),
  ]);
  const ok = new Set<OrigemDoConnect>(["documentos"]);
  // As solicitações são conferidas uma a uma (setor ou responsável); os envios,
  // como na rota deles, só pelo escritório.
  if (solicitacoes) ok.add("solicitacoes").add("envios");
  if (pendencias && canViewSector(ctx, await setorDe(t, "bpo_pendencias"))) ok.add("pendencias");
  if (processos && canActOnSector(ctx, await setorDe(t, "societario_processos"))) ok.add("processos");
  if (conversa && canViewSector(ctx, await setorDe(t, "bpo_comunicacao"))) ok.add("conversa");
  return ok;
}

const iso = (d: Date) => d.toISOString();

/** Os anexos da empresa nos módulos, por origem, mais novo primeiro. Só as origens com algo para mostrar. */
export async function anexosDoConnect(ctx: AuthContext, companyId: string): Promise<GrupoDoConnect[]> {
  const prisma = getPrisma();
  const t = ctx.tenantId;
  const ok = await origensAoAlcance(ctx);
  const LIMITE = 200;

  const [documentos, solicitacoes, pendencias, processos, envios, conversa] = await Promise.all([
    prisma.document.findMany({
      where: { tenantId: t, entityType: "COMPANY", entityId: companyId },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: { id: true, fileName: true, fileSize: true, mimeType: true, createdAt: true, category: true, uploadedBy: { select: { name: true } } },
    }),
    ok.has("solicitacoes")
      ? prisma.serviceRequestAttachment.findMany({
          where: { request: { tenantId: t, companyId } },
          orderBy: { createdAt: "desc" },
          take: LIMITE,
          select: {
            id: true, fileName: true, sizeBytes: true, mimeType: true, createdAt: true, uploadedByPortalUserId: true,
            uploadedByUser: { select: { name: true } }, uploadedByPortal: { select: { name: true } },
            request: { select: { id: true, number: true, sectorCode: true, assigneeId: true, subject: { select: { label: true } } } },
          },
        })
      : Promise.resolve([]),
    ok.has("pendencias")
      ? prisma.clientRequestAttachment.findMany({
          where: { request: { tenantId: t, companyId } },
          orderBy: { createdAt: "desc" },
          take: LIMITE,
          select: {
            id: true, fileName: true, sizeBytes: true, mimeType: true, createdAt: true, uploadedByPortalUserId: true,
            uploadedByUser: { select: { name: true } }, uploadedByPortal: { select: { name: true } },
            request: { select: { id: true, title: true } },
          },
        })
      : Promise.resolve([]),
    ok.has("processos")
      ? prisma.processDocument.findMany({
          where: { tenantId: t, process: { companyId } },
          orderBy: { createdAt: "desc" },
          take: LIMITE,
          select: {
            id: true, fileName: true, sizeBytes: true, mimeType: true, createdAt: true, uploadedByPortalUserId: true, description: true,
            uploadedByUser: { select: { name: true } }, uploadedByPortal: { select: { name: true } },
            process: { select: { id: true, title: true, type: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    ok.has("envios")
      ? prisma.clientDocument.findMany({
          where: { tenantId: t, companyId, fileUrl: { not: null } },
          orderBy: { createdAt: "desc" },
          take: LIMITE,
          select: { id: true, title: true, fileName: true, fileSize: true, mimeType: true, createdAt: true, createdBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
    ok.has("conversa")
      ? prisma.companyMessageAttachment.findMany({
          where: { tenantId: t, message: { companyId } },
          orderBy: { createdAt: "desc" },
          take: LIMITE,
          select: {
            id: true, fileName: true, sizeBytes: true, mimeType: true, createdAt: true,
            message: { select: { authorPortalUserId: true, authorUser: { select: { name: true } }, authorPortal: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  const grupos: GrupoDoConnect[] = [
    {
      origem: "documentos",
      rotulo: ROTULO_DA_ORIGEM.documentos,
      itens: documentos.map((d) => ({
        origem: "documentos",
        id: d.id,
        nome: d.fileName,
        tamanho: d.fileSize,
        enviadoEm: iso(d.createdAt),
        enviadoPor: d.uploadedBy?.name ?? null,
        peloCliente: false,
        contexto: "Aba Documentos da ficha",
        baixar: `/api/documents/${d.id}`,
        abrirNaOrigem: null,
        previa: false,
      })),
    },
    {
      origem: "solicitacoes",
      rotulo: ROTULO_DA_ORIGEM.solicitacoes,
      itens: solicitacoes
        .filter((a) => podeVerSolicitacao(ctx, a.request))
        .map((a) => ({
          origem: "solicitacoes",
          id: a.id,
          nome: a.fileName,
          tamanho: a.sizeBytes,
          enviadoEm: iso(a.createdAt),
          enviadoPor: a.uploadedByPortal?.name ?? a.uploadedByUser?.name ?? null,
          peloCliente: a.uploadedByPortalUserId !== null,
          contexto: `Solicitação nº ${a.request.number} · ${a.request.subject.label}`,
          baixar: `/api/solicitacoes/anexos/${a.id}`,
          abrirNaOrigem: `/solicitacoes/${a.request.id}`,
          previa: temPrevia(a.mimeType, a.fileName),
        })),
    },
    {
      origem: "pendencias",
      rotulo: ROTULO_DA_ORIGEM.pendencias,
      itens: pendencias.map((a) => ({
        origem: "pendencias",
        id: a.id,
        nome: a.fileName,
        tamanho: a.sizeBytes,
        enviadoEm: iso(a.createdAt),
        enviadoPor: a.uploadedByPortal?.name ?? a.uploadedByUser?.name ?? null,
        peloCliente: a.uploadedByPortalUserId !== null,
        contexto: `Pendência · ${a.request.title}`,
        baixar: `/api/pendencias/anexos/${a.id}`,
        abrirNaOrigem: `/pendencias/${a.request.id}`,
        previa: temPrevia(a.mimeType, a.fileName),
      })),
    },
    {
      origem: "processos",
      rotulo: ROTULO_DA_ORIGEM.processos,
      itens: processos.map((a) => ({
        origem: "processos",
        id: a.id,
        nome: a.fileName,
        tamanho: a.sizeBytes,
        enviadoEm: iso(a.createdAt),
        enviadoPor: a.uploadedByPortal?.name ?? a.uploadedByUser?.name ?? null,
        peloCliente: a.uploadedByPortalUserId !== null,
        contexto: [a.process.title || a.process.type.name, a.description].filter(Boolean).join(" · "),
        baixar: `/api/processos/documentos/${a.id}`,
        abrirNaOrigem: `/processos/${a.process.id}#documentos-do-processo`,
        previa: temPrevia(a.mimeType, a.fileName),
      })),
    },
    {
      origem: "envios",
      rotulo: ROTULO_DA_ORIGEM.envios,
      itens: envios.map((d) => ({
        origem: "envios",
        id: d.id,
        nome: d.fileName ?? "arquivo",
        tamanho: d.fileSize,
        enviadoEm: iso(d.createdAt),
        enviadoPor: d.createdBy?.name ?? null,
        peloCliente: false,
        contexto: `Envio · ${d.title}`,
        baixar: `/solicitacoes/envios/${d.id}/arquivo`,
        abrirNaOrigem: `/solicitacoes/envios/${d.id}`,
        previa: false,
      })),
    },
    {
      origem: "conversa",
      rotulo: ROTULO_DA_ORIGEM.conversa,
      itens: conversa.map((a) => ({
        origem: "conversa",
        id: a.id,
        nome: a.fileName,
        tamanho: a.sizeBytes,
        enviadoEm: iso(a.createdAt),
        enviadoPor: a.message.authorPortal?.name ?? a.message.authorUser?.name ?? null,
        peloCliente: a.message.authorPortalUserId !== null,
        contexto: "Conversa com o cliente",
        baixar: `/api/comunicacao/anexos/${a.id}`,
        abrirNaOrigem: `/comunicacao?empresa=${companyId}`,
        previa: false,
      })),
    },
  ];
  return grupos.filter((g) => g.itens.length > 0);
}

/**
 * Quantos anexos cada empresa tem nos módulos, ao alcance de quem pede — o
 * número da lista de empresas dos Arquivos. Uma consulta por origem para a
 * página inteira, com as mesmas réguas de `anexosDoConnect` (sem o teto de 200
 * por origem, que é da listagem).
 */
export async function totaisDoConnect(ctx: AuthContext, companyIds: string[]): Promise<Map<string, number>> {
  const total = new Map<string, number>();
  if (companyIds.length === 0) return total;
  const prisma = getPrisma();
  const t = ctx.tenantId;
  const ok = await origensAoAlcance(ctx);
  const somar = (companyId: string | null | undefined, n = 1) => {
    if (companyId) total.set(companyId, (total.get(companyId) ?? 0) + n);
  };

  const [documentos, solicitacoes, pendencias, processos, envios, conversa] = await Promise.all([
    prisma.document.groupBy({ by: ["entityId"], where: { tenantId: t, entityType: "COMPANY", entityId: { in: companyIds } }, _count: { _all: true } }),
    ok.has("solicitacoes")
      ? prisma.serviceRequestAttachment.findMany({
          where: { request: { tenantId: t, companyId: { in: companyIds } } },
          select: { request: { select: { companyId: true, sectorCode: true, assigneeId: true } } },
        })
      : Promise.resolve([]),
    ok.has("pendencias")
      ? prisma.clientRequestAttachment.findMany({ where: { request: { tenantId: t, companyId: { in: companyIds } } }, select: { request: { select: { companyId: true } } } })
      : Promise.resolve([]),
    ok.has("processos")
      ? prisma.processDocument.findMany({ where: { tenantId: t, process: { companyId: { in: companyIds } } }, select: { process: { select: { companyId: true } } } })
      : Promise.resolve([]),
    ok.has("envios")
      ? prisma.clientDocument.groupBy({ by: ["companyId"], where: { tenantId: t, companyId: { in: companyIds }, fileUrl: { not: null } }, _count: { _all: true } })
      : Promise.resolve([]),
    ok.has("conversa")
      ? prisma.companyMessageAttachment.findMany({ where: { tenantId: t, message: { companyId: { in: companyIds } } }, select: { message: { select: { companyId: true } } } })
      : Promise.resolve([]),
  ]);
  for (const d of documentos) somar(d.entityId, d._count._all);
  for (const a of solicitacoes) if (podeVerSolicitacao(ctx, a.request)) somar(a.request.companyId);
  for (const a of pendencias) somar(a.request.companyId);
  for (const a of processos) somar(a.process.companyId);
  for (const d of envios) somar(d.companyId, d._count._all);
  for (const a of conversa) somar(a.message.companyId);
  return total;
}

/** Quantos anexos a empresa tem nos módulos, ao alcance de quem pede — para a linha da pasta "Do Connect". */
export async function totalDoConnect(ctx: AuthContext, companyId: string): Promise<number> {
  return (await anexosDoConnect(ctx, companyId)).reduce((n, g) => n + g.itens.length, 0);
}

/**
 * O conteúdo de um anexo do "Do Connect", para copiar para uma pasta. Confere
 * de novo a régua da origem (e o sensível, nos documentos da ficha) e devolve
 * a empresa dele, que a cópia exige ser a mesma da pasta de destino.
 */
export async function lerDoConnect(
  ctx: AuthContext,
  origem: OrigemDoConnect,
  id: string
): Promise<{ nome: string; mime: string; conteudo: Buffer; companyId: string } | null> {
  const prisma = getPrisma();
  const t = ctx.tenantId;
  const ok = await origensAoAlcance(ctx);
  if (!ok.has(origem)) return null;

  switch (origem) {
    case "documentos": {
      const d = await prisma.document.findFirst({
        where: { id, tenantId: t, entityType: "COMPANY" },
        select: { fileName: true, fileUrl: true, mimeType: true, category: true, sensitive: true, entityId: true },
      });
      if (!d) return null;
      const grupo = grupoSensivelDoDocumento(d.category, d.sensitive);
      if (grupo && !(await canViewSensitiveField(ctx, grupo))) return null;
      const conteudo = await lerArquivoDoDocumentoDaFicha(d.fileUrl);
      return conteudo ? { nome: d.fileName, mime: d.mimeType, conteudo, companyId: d.entityId } : null;
    }
    case "solicitacoes": {
      const a = await prisma.serviceRequestAttachment.findFirst({
        where: { id, request: { tenantId: t } },
        select: { fileName: true, fileUrl: true, mimeType: true, request: { select: { companyId: true, sectorCode: true, assigneeId: true } } },
      });
      if (!a || !podeVerSolicitacao(ctx, a.request)) return null;
      const conteudo = await anexosDaSolicitacao.lerAnexo(a.fileUrl);
      return conteudo ? { nome: a.fileName, mime: a.mimeType, conteudo, companyId: a.request.companyId } : null;
    }
    case "pendencias": {
      const a = await prisma.clientRequestAttachment.findFirst({
        where: { id, request: { tenantId: t } },
        select: { fileName: true, fileUrl: true, mimeType: true, request: { select: { companyId: true } } },
      });
      if (!a) return null;
      const conteudo = await lerAnexoDaPendencia(a.fileUrl);
      return conteudo ? { nome: a.fileName, mime: a.mimeType, conteudo, companyId: a.request.companyId } : null;
    }
    case "processos": {
      const a = await prisma.processDocument.findFirst({
        where: { id, tenantId: t },
        select: { fileName: true, fileUrl: true, mimeType: true, process: { select: { companyId: true } } },
      });
      if (!a) return null;
      const conteudo = await arquivosDoProcesso.lerAnexo(a.fileUrl);
      return conteudo ? { nome: a.fileName, mime: a.mimeType, conteudo, companyId: a.process.companyId } : null;
    }
    case "envios": {
      const d = await prisma.clientDocument.findFirst({
        where: { id, tenantId: t },
        select: { fileName: true, fileUrl: true, mimeType: true, companyId: true },
      });
      if (!d?.fileUrl) return null;
      const conteudo = await lerArquivoDoDocumento(d.fileUrl);
      return conteudo ? { nome: d.fileName ?? "arquivo", mime: d.mimeType ?? "application/octet-stream", conteudo, companyId: d.companyId } : null;
    }
    case "conversa": {
      const a = await prisma.companyMessageAttachment.findFirst({
        where: { id, tenantId: t },
        select: { fileName: true, fileUrl: true, mimeType: true, message: { select: { companyId: true } } },
      });
      if (!a) return null;
      const conteudo = await anexosDaConversa.lerAnexo(a.fileUrl);
      return conteudo ? { nome: a.fileName, mime: a.mimeType, conteudo, companyId: a.message.companyId } : null;
    }
  }
}
