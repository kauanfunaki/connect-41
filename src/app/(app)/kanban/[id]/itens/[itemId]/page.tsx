import { KanbanItemDetail } from "@/components/kanban/KanbanItemDetail";
import { PageContainer } from "@/components/shared/PageContainer";

export default async function KanbanItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;

  return (
    <PageContainer>
      <KanbanItemDetail id={id} itemId={itemId} />
    </PageContainer>
  );
}
