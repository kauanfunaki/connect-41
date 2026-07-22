import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere, scopedPipelineWhere, scopedVagaWhere } from "@/lib/auth/scope";
import { boardPath } from "@/lib/kanbanPaths";

const LIMIT = 5;

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ companies: [], people: [], candidatos: [], pipelines: [], vagas: [], documentos: [], tarefas: [] });
  }

  const prisma = getPrisma();
  const [companies, people, candidatos, pipelines, vagas, documentos, tarefaItems] = await Promise.all([
    prisma.company.findMany({
      where: { ...(await scopedCompanyWhere(ctx)), name: { contains: q } },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true },
    }),
    prisma.person.findMany({
      where: { ...(await scopedPersonWhere(ctx)), type: "COLABORADOR", name: { contains: q } },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true },
    }),
    prisma.person.findMany({
      where: { ...(await scopedPersonWhere(ctx)), type: "CANDIDATO", name: { contains: q } },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true },
    }),
    prisma.pipeline.findMany({
      where: { ...scopedPipelineWhere(ctx), name: { contains: q } },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true },
    }),
    prisma.vaga.findMany({
      where: { ...scopedVagaWhere(ctx), title: { contains: q } },
      orderBy: { title: "asc" },
      take: LIMIT,
      select: { id: true, title: true },
    }),
    // Documento não tem página própria — o resultado leva pra ficha da
    // entidade dona (Empresa/Pessoa/Vaga). Documentos de item de Kanban
    // (PIPELINE_ITEM) caem no fallback /kanban, sem link fundo certo.
    prisma.document.findMany({
      where: { tenantId: ctx.tenantId, fileName: { contains: q } },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { id: true, fileName: true, entityType: true, entityId: true },
    }),
    // Tarefas: só bate por título próprio (top-level normalmente não tem — usa
    // o nome da entidade, que já aparece nas categorias Empresas/Pessoas acima)
    // ou por descrição. Cobre principalmente subtarefas e itens com título.
    prisma.pipelineItem.findMany({
      where: {
        pipeline: scopedPipelineWhere(ctx),
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
      select: { id: true, title: true, entityId: true, entityType: true, pipeline: { select: { id: true, sectorCode: true } } },
    }),
  ]);

  const tarefaEntityIds = { COMPANY: new Set<string>(), PERSON: new Set<string>() };
  for (const t of tarefaItems) tarefaEntityIds[t.entityType].add(t.entityId);
  const [tarefaCompanies, tarefaPeople] = await Promise.all([
    tarefaEntityIds.COMPANY.size > 0
      ? prisma.company.findMany({ where: { id: { in: [...tarefaEntityIds.COMPANY] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    tarefaEntityIds.PERSON.size > 0
      ? prisma.person.findMany({ where: { id: { in: [...tarefaEntityIds.PERSON] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const tarefaEntityNames: Record<string, string> = {};
  for (const c of tarefaCompanies) tarefaEntityNames[c.id] = c.name;
  for (const p of tarefaPeople) tarefaEntityNames[p.id] = p.name;

  return NextResponse.json({
    companies,
    people,
    candidatos,
    pipelines,
    vagas: vagas.map((v) => ({ id: v.id, name: v.title })),
    documentos: documentos.map((d) => ({ id: d.id, name: d.fileName, entityType: d.entityType, entityId: d.entityId })),
    tarefas: tarefaItems.map((t) => ({
      id: t.id,
      name: t.title ?? tarefaEntityNames[t.entityId] ?? "(removido)",
      href: `${boardPath(t.pipeline)}/itens/${t.id}`,
    })),
  });
}
