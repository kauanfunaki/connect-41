import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { Folder as FolderIcon } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ListsTable, type ListRow } from "@/components/kanban/ListsTable";
import { NewFolderButton } from "@/components/kanban/NewFolderButton";
import { NewListButton } from "@/components/kanban/NewListButton";
import { DeleteEntityMenu } from "@/components/kanban/DeleteEntityMenu";
import { criarPasta, criarListaSimples, excluirPasta, excluirLista } from "@/app/(app)/kanban/spaces-actions";
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

// Espaço de um setor: Pastas + Listas soltas. Listas abrem no /kanban/{id}.
// Foi o "equivalente genérico" do Espaço do BPO até 2026-08-05, quando a rota
// dedicada /bpo-financeiro saiu e esta passou a atender todos os setores.
export default async function SectorSpacePage({ params }: { params: Promise<{ code: string; spaceId: string }> }) {
  const { code, spaceId } = await params;
  const ctx = await getAuthContext();
  // Checagem explícita em vez de `{ sectorCode: code, ...scopedSpaceWhere(ctx) }`:
  // scopedSpaceWhere devolve a própria chave sectorCode (um filtro `{in:...}`
  // pra quem não é full-access, ou nenhum filtro pra quem é) — espalhada por
  // último, ela sobrescreve o `code` literal em vez de combinar com ele,
  // deixando abrir o espaço de um setor sob a URL de outro setor.
  if (!canViewSector(ctx, code)) notFound();

  const prisma = getPrisma();
  const [space, { labels: sectorLabels }] = await Promise.all([
    prisma.space.findFirst({ where: { id: spaceId, tenantId: ctx.tenantId, sectorCode: code } }),
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
      {/* A trilha pelo `Breadcrumb` compartilhado (07/10/2026) — era escrita à mão. */}
      <Breadcrumb
        className="mb-1!"
        items={[{ label: sectorLabel(sectorLabels, code), href: `/setor/${code}` }, { label: space.name }]}
      />

      {/* As ações moram no `action` do PageHeader (30/09): o cabeçalho estava
          aninhado numa linha própria, com a margem dele somada à da linha. */}
      <div className="mt-1">
        <PageHeader
          title={space.name}
          action={
            canCreate && (
              <div className="flex items-center gap-2">
                <NewFolderButton action={createFolderAction} />
                <NewListButton action={createListAction} />
              </div>
            )
          }
        />
      </div>

      <div className="mb-6">
        <h2 className="text-card-title font-semibold text-fg mb-2.5">Pastas</h2>
        {/* Os dois vazios da tela no mesmo desenho (07/10/2026): "Pastas" era
            uma frase solta e "Listas", um EmptyState num cartão à mão. */}
        {folders.length === 0 ? (
          <Card>
            <EmptyState title="Nenhuma pasta neste espaço ainda" description="Pastas agrupam as listas do espaço." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {folders.map((f) => (
              <div key={f.id} className="relative">
                <Card href={`/setor/${code}/pastas/${f.id}`} className="flex items-center gap-2.5 px-4 py-3 pr-10">
                  <FolderIcon size={16} className="text-fg-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-card-title font-semibold text-fg truncate">{f.name}</p>
                    <p className="text-micro text-fg-muted">{f._count.pipelines} {f._count.pipelines === 1 ? "lista" : "listas"}</p>
                  </div>
                </Card>
                {canCreate && (
                  <div className="absolute top-1/2 -translate-y-1/2 right-2.5">
                    <DeleteEntityMenu kind="pasta" name={f.name} action={excluirPasta.bind(null, f.id)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-card-title font-semibold text-fg mb-2.5">Listas</h2>
        {looseLists.length === 0 ? (
          <Card>
            <EmptyState title="Nenhuma lista solta neste espaço" description="Listas fora de pasta aparecem aqui." />
          </Card>
        ) : (
          <ListsTable
            lists={looseLists.map(toListRow)}
            basePath="/kanban"
            deleteAction={canCreate ? excluirLista : undefined}
          />
        )}
      </div>
    </PageContainer>
  );
}
