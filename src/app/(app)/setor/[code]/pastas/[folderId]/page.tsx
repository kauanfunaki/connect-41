import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListsTable, type ListRow } from "@/components/kanban/ListsTable";
import { NewListButton } from "@/components/kanban/NewListButton";
import { criarListaSimples, excluirLista } from "@/app/(app)/kanban/spaces-actions";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector, canViewSector } from "@/lib/auth/context";
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

// Pasta de um Espaço, para qualquer setor (a rota dedicada do BPO saiu em 2026-08-05).
export default async function SectorFolderPage({ params }: { params: Promise<{ code: string; folderId: string }> }) {
  const { code, folderId } = await params;
  const ctx = await getAuthContext();
  // Checagem explícita — ver setor/[code]/espacos/[spaceId]/page.tsx (spread
  // de scopedSpaceWhere sobrescrevia a chave sectorCode literal).
  if (!canViewSector(ctx, code)) notFound();

  const prisma = getPrisma();
  const [folder, { labels: sectorLabels }] = await Promise.all([
    prisma.folder.findFirst({
      where: { id: folderId, space: { tenantId: ctx.tenantId, sectorCode: code } },
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
      {/* A trilha pelo `Breadcrumb` compartilhado (07/10/2026) — era escrita à mão. */}
      <Breadcrumb
        className="mb-1!"
        items={[
          { label: sectorLabel(sectorLabels, code), href: `/setor/${code}` },
          { label: folder.space.name, href: `/setor/${code}/espacos/${folder.space.id}`, truncate: true },
          { label: folder.name },
        ]}
      />

      {/* A ação mora no `action` do PageHeader (30/09): o cabeçalho estava
          aninhado numa linha própria, com a margem dele somada à da linha. */}
      <div className="mt-1">
        <PageHeader title={folder.name} action={canCreate && <NewListButton action={createListAction} />} />
      </div>

      <div>
        <h2 className="text-card-title font-semibold text-fg mb-2.5">Listas</h2>
        {lists.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)]">
            <EmptyState title="Nenhuma lista nesta pasta ainda" description="Crie a primeira lista pra começar a organizar as tarefas." />
          </div>
        ) : (
          <ListsTable
            lists={lists.map(toListRow)}
            basePath="/kanban"
            deleteAction={canCreate ? excluirLista : undefined}
          />
        )}
      </div>
    </PageContainer>
  );
}
