import { getPrisma } from "@/lib/prisma";
import { boardPath } from "@/lib/kanbanPaths";

export type SpaceDocument = { id: string; title: string; taskName: string; href: string };

// Resolve o nome de exibição de uma tarefa (título próprio ou nome da
// entidade vinculada) pra várias linhas de uma vez, sem N+1 queries.
async function resolveTaskNames(
  tenantId: string,
  items: { title: string | null; entityId: string | null; entityType: "COMPANY" | "PERSON" | null }[]
): Promise<(item: (typeof items)[number]) => string> {
  const prisma = getPrisma();
  const companyIds = new Set<string>();
  const personIds = new Set<string>();
  for (const i of items) {
    if (!i.entityId) continue;
    (i.entityType === "COMPANY" ? companyIds : personIds).add(i.entityId);
  }
  const [companies, people] = await Promise.all([
    companyIds.size > 0 ? prisma.company.findMany({ where: { id: { in: [...companyIds] }, tenantId }, select: { id: true, name: true } }) : Promise.resolve([]),
    personIds.size > 0 ? prisma.person.findMany({ where: { id: { in: [...personIds] }, tenantId }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const names: Record<string, string> = {};
  for (const c of companies) names[c.id] = c.name;
  for (const p of people) names[p.id] = p.name;
  return (item) => item.title ?? (item.entityId ? names[item.entityId] : null) ?? "(sem título)";
}

// Documentos (CanvasPage) de todas as Listas de um Espaço — inclui as que
// estão dentro de Pastas do espaço também, pra seção "Documentos" do Espaço
// mostrar tudo, e a da Pasta mostrar só a sua fatia.
export async function getSpaceDocuments(tenantId: string, spaceId: string): Promise<SpaceDocument[]> {
  const prisma = getPrisma();
  const pages = await prisma.canvasPage.findMany({
    where: { tenantId, pipelineItem: { pipeline: { spaceId } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true, title: true,
      pipelineItem: {
        select: {
          id: true, title: true, entityId: true, entityType: true,
          pipeline: { select: { id: true, sectorCode: true } },
        },
      },
    },
  });
  const nameFor = await resolveTaskNames(tenantId, pages.map((p) => p.pipelineItem));
  return pages.map((p) => ({
    id: p.id,
    title: p.title,
    taskName: nameFor(p.pipelineItem),
    href: `${boardPath(p.pipelineItem.pipeline)}/itens/${p.pipelineItem.id}`,
  }));
}

export async function getFolderDocuments(tenantId: string, folderId: string): Promise<SpaceDocument[]> {
  const prisma = getPrisma();
  const pages = await prisma.canvasPage.findMany({
    where: { tenantId, pipelineItem: { pipeline: { folderId } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true, title: true,
      pipelineItem: {
        select: {
          id: true, title: true, entityId: true, entityType: true,
          pipeline: { select: { id: true, sectorCode: true } },
        },
      },
    },
  });
  const nameFor = await resolveTaskNames(tenantId, pages.map((p) => p.pipelineItem));
  return pages.map((p) => ({
    id: p.id,
    title: p.title,
    taskName: nameFor(p.pipelineItem),
    href: `${boardPath(p.pipelineItem.pipeline)}/itens/${p.pipelineItem.id}`,
  }));
}
