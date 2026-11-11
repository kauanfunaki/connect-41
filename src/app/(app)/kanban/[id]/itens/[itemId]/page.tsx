import { KanbanItemDetail } from "@/components/kanban/KanbanItemDetail";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext } from "@/lib/auth/context";
import { boardPath } from "@/lib/kanbanPaths";
import { abrirPeloEndereco } from "@/lib/enderecoCurtoServidor";

export default async function KanbanItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, itemId } = await params;
  // O endereço curto da tarefa no quadro (10/11/2026, pedido do Kauan):
  // /kanban/{quadro}/itens/tarefa-77. O do uuid passa para ele, com a query.
  // O modal sobre o quadro (@modal) aceita os dois e não redireciona.
  const ctx = await getAuthContext();
  const { id: uuid } = await abrirPeloEndereco("tarefa", ctx.tenantId, itemId, await searchParams, `${boardPath({ id })}/itens`);

  return (
    <PageContainer>
      <KanbanItemDetail id={id} itemId={uuid} />
    </PageContainer>
  );
}
