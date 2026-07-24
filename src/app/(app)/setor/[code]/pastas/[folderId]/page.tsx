import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListsTable, type ListRow } from "@/components/kanban/ListsTable";
import { NewListButton } from "@/components/kanban/NewListButton";
import { criarListaSimples } from "@/app/(app)/kanban/spaces-actions";
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

// Equivalente genérico de src/app/(app)/bpo-financeiro/pastas/[folderId]/page.tsx
// para setores sem módulo dedicado.
export default async function SectorFolderPage({ params }: { params: Promise<{ code: string; folderId: string }> }) {
  const { code, folderId } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const [folder, { labels: sectorLabels }] = await Promise.all([
    prisma.folder.findFirst({
      where: { id: folderId, space: { sectorCode: code, ...scopedSpaceWhere(ctx) } },
      include: { space: { select: { id: true, name: true, sectorCode: true } } },
    }),
    getSectorMaps(ctx.tenantId),
  ]);
  if (!folder) notFound();

  const canCreate = canManageSector(ctx, folder.space.sectorCode);

  const lists = await prisma.pipeline.findMany({
    where: { folderId },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, color: true, startDate: true, endDate: true,
      items: { where: { parentItemId: null }, select: { stage: { select: { isTerminal: true } } } },
    },
  });

  const createListAction = criarListaSimples.bind(null, folder.space.id, folderId);

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-1">
        <Link href={`/setor/${code}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          {sectorLabel(sectorLabels, code)}
        </Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/setor/${code}/espacos/${folder.space.id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          {folder.space.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">{folder.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6 mt-1">
        <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">{folder.name}</h1>
        {canCreate && <NewListButton action={createListAction} />}
      </div>

      <div>
        <h2 className="text-[13px] font-semibold text-fg mb-2.5">Listas</h2>
        {lists.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl">
            <EmptyState title="Nenhuma lista nesta pasta ainda" description="Crie a primeira lista pra começar a organizar as tarefas." />
          </div>
        ) : (
          <ListsTable lists={lists.map(toListRow)} basePath="/kanban" />
        )}
      </div>
    </PageContainer>
  );
}
