import { KanbanItemDetail } from "@/components/kanban/KanbanItemDetail";
import { KanbanItemModal } from "@/components/kanban/KanbanItemModal";

export default async function KanbanItemModalRoute({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;

  return (
    <KanbanItemModal>
      <KanbanItemDetail id={id} itemId={itemId} showBreadcrumb={false} />
    </KanbanItemModal>
  );
}
