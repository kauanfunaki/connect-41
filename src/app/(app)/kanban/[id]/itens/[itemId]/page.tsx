import { KanbanItemDetail } from "@/components/kanban/KanbanItemDetail";

export default async function KanbanItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <KanbanItemDetail id={id} itemId={itemId} />
    </div>
  );
}
