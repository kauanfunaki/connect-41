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
import { JanelaDoEspaco } from "@/components/kanban/JanelaDoEspaco";
import { QuadradoDoEspaco } from "@/components/kanban/QuadradoDoEspaco";
import { criarPasta, criarListaSimples, editarEspaco, excluirPasta, excluirLista } from "@/app/(app)/kanban/spaces-actions";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { poderesNoEspaco, ROTULO_DA_PERMISSAO } from "@/lib/kanban/permissaoDoEspaco";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";

function toListRow(p: {
  id: string; name: string; color: string | null; startDate: Date | null; endDate: Date | null;
  items: { stage: { isTerminal: boolean } }[];
  _count: { items: number };
  folder: { id: string; name: string } | null;
}): ListRow {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    startDate: p.startDate,
    endDate: p.endDate,
    total: p.items.length,
    // `items` são só as de cima; a contagem leva todos os níveis.
    subatividades: p._count.items - p.items.length,
    done: p.items.filter((i) => i.stage.isTerminal).length,
    pasta: p.folder ? { id: p.folder.id, nome: p.folder.name } : null,
  };
}

// Espaço de um setor: as pastas e **todas** as listas — as soltas e as das
// pastas, com a coluna "Pasta" (Ajustes 15/10, G3: antes só as soltas, e para
// ver as outras era preciso abrir pasta por pasta). Listas abrem no /kanban/{id}.
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

  // O que cada um faz aqui vem da permissão padrão do espaço (05/11/2026):
  // pasta com "Edição total" (e a coordenação), lista com "Editar" para cima.
  // Excluir pasta e lista: só o administrador (13/10/2026).
  const poderes = poderesNoEspaco(ctx, space);
  const canCreate = poderes.criarPasta;
  const podeCriarTarefa = poderes.editar;
  const canDelete = poderes.excluir;
  const pipelineSelect = {
    id: true, name: true, color: true, startDate: true, endDate: true,
    items: { where: { parentItemId: null }, select: { stage: { select: { isTerminal: true } } } },
    _count: { select: { items: true } },
    folder: { select: { id: true, name: true } },
  } as const;

  const [folders, lists] = await Promise.all([
    prisma.folder.findMany({
      where: { spaceId },
      orderBy: { order: "asc" },
      include: { _count: { select: { pipelines: true } } },
    }),
    prisma.pipeline.findMany({
      where: { spaceId },
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
          title={
            <span className="inline-flex items-center gap-3 min-w-0">
              <QuadradoDoEspaco nome={space.name} cor={space.color} icone={space.icon} tamanho="md" />
              <span className="truncate">{space.name}</span>
            </span>
          }
          subtitle={
            <>
              {space.description ? `${space.description} · ` : ""}
              Colaboradores: {ROTULO_DA_PERMISSAO[space.defaultPermission]}
            </>
          }
          action={
            (canCreate || podeCriarTarefa || poderes.gerenciar) && (
              <div className="flex items-center gap-2">
                {poderes.gerenciar && (
                  <JanelaDoEspaco
                    modo="editar"
                    action={editarEspaco.bind(null, space.id)}
                    inicial={{
                      name: space.name,
                      description: space.description,
                      color: space.color,
                      icon: space.icon,
                      defaultPermission: space.defaultPermission,
                    }}
                  />
                )}
                {canCreate && <NewFolderButton action={createFolderAction} />}
                {podeCriarTarefa && <NewListButton action={createListAction} />}
              </div>
            )
          }
        />
      </div>

      <div className="mb-6">
        <h2 className="text-section font-semibold text-fg mb-2.5">Pastas</h2>
        {/* Os dois vazios da tela no mesmo desenho (07/10/2026): "Pastas" era
            uma frase solta e "Listas", um EmptyState num cartão à mão. */}
        {folders.length === 0 ? (
          <Card>
            <EmptyState title="Nenhuma pasta neste espaço ainda" description="Pastas agrupam as tarefas do espaço." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {folders.map((f) => (
              <div key={f.id} className="relative">
                <Card href={`/setor/${code}/pastas/${f.id}`} className="flex items-center gap-2.5 px-4 py-3 pr-12">
                  <FolderIcon size={16} className="text-fg-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-card-title font-semibold text-fg truncate">{f.name}</p>
                    <p className="text-micro text-fg-muted">{f._count.pipelines} {f._count.pipelines === 1 ? "tarefa" : "tarefas"}</p>
                  </div>
                </Card>
                {canDelete && (
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
        <h2 className="text-section font-semibold text-fg mb-2.5">Tarefas</h2>
        {lists.length === 0 ? (
          <Card>
            <EmptyState title="Nenhuma tarefa neste espaço" description="As tarefas do espaço, soltas ou dentro das pastas, aparecem aqui." />
          </Card>
        ) : (
          <ListsTable
            lists={lists.map(toListRow)}
            basePath="/kanban"
            pastaBasePath={`/setor/${code}/pastas`}
            deleteAction={canDelete ? excluirLista : undefined}
          />
        )}
      </div>
    </PageContainer>
  );
}
