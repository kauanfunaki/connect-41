import Link from "next/link";
import { notFound } from "next/navigation";
import { Folder as FolderIcon } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListsTable, type ListRow } from "@/components/kanban/ListsTable";
import { NewFolderButton } from "@/components/kanban/NewFolderButton";
import { NewListButton } from "@/components/kanban/NewListButton";
import { criarPasta, criarListaSimples } from "@/app/(app)/kanban/spaces-actions";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedSpaceWhere } from "@/lib/auth/scope";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";

function toListRow(p: {
  id: string; name: string; color: string | null; startDate: Date | null; endDate: Date | null;
  items: { stage: { isTerminal: boolean } }[];
}): ListRow {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    startDate: p.startDate,
    endDate: p.endDate,
    total: p.items.length,
    done: p.items.filter((i) => i.stage.isTerminal).length,
  };
}

// Equivalente genérico de src/app/(app)/bpo-financeiro/espacos/[spaceId]/page.tsx
// para setores sem módulo dedicado — Listas aqui abrem no /kanban/{id} comum.
export default async function SectorSpacePage({ params }: { params: Promise<{ code: string; spaceId: string }> }) {
  const { code, spaceId } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const [space, { labels: sectorLabels }] = await Promise.all([
    prisma.space.findFirst({ where: { id: spaceId, sectorCode: code, ...scopedSpaceWhere(ctx) } }),
    getSectorMaps(ctx.tenantId),
  ]);
  if (!space) notFound();

  const canCreate = canManageSector(ctx, space.sectorCode);
  const pipelineSelect = {
    id: true, name: true, color: true, startDate: true, endDate: true,
    items: { where: { parentItemId: null }, select: { stage: { select: { isTerminal: true } } } },
  } as const;

  const [folders, looseLists] = await Promise.all([
    prisma.folder.findMany({
      where: { spaceId },
      orderBy: { order: "asc" },
      include: { _count: { select: { pipelines: true } } },
    }),
    prisma.pipeline.findMany({
      where: { spaceId, folderId: null },
      orderBy: { name: "asc" },
      select: pipelineSelect,
    }),
  ]);

  const createFolderAction = criarPasta.bind(null, spaceId);
  const createListAction = criarListaSimples.bind(null, spaceId, null);

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-1">
        <Link href={`/setor/${code}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          {sectorLabel(sectorLabels, code)}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">{space.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6 mt-1">
        <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">{space.name}</h1>
        {canCreate && (
          <div className="flex items-center gap-2">
            <NewFolderButton action={createFolderAction} />
            <NewListButton action={createListAction} />
          </div>
        )}
      </div>

      <div className="mb-6">
        <h2 className="text-[13px] font-semibold text-fg mb-2.5">Pastas</h2>
        {folders.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Nenhuma pasta neste espaço ainda.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {folders.map((f) => (
              <Link
                key={f.id}
                href={`/setor/${code}/pastas/${f.id}`}
                className="flex items-center gap-2.5 bg-surface border border-border rounded-lg px-4 py-3 hover:border-border-strong hover:-translate-y-0.5 transition-[border-color,transform]"
              >
                <FolderIcon size={16} className="text-fg-muted flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg truncate">{f.name}</p>
                  <p className="text-[11px] text-fg-muted">{f._count.pipelines} {f._count.pipelines === 1 ? "lista" : "listas"}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-[13px] font-semibold text-fg mb-2.5">Listas</h2>
        {looseLists.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl">
            <EmptyState title="Nenhuma lista solta neste espaço" description="Listas fora de pasta aparecem aqui." />
          </div>
        ) : (
          <ListsTable lists={looseLists.map(toListRow)} basePath="/kanban" />
        )}
      </div>
    </PageContainer>
  );
}
