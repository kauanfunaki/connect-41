import { redirect } from "next/navigation";

// Espelha src/app/(app)/kanban/[id]/itens/novo/page.tsx — "itens/novo" colide
// com a rota interceptada @modal/(.)itens/[itemId] (o valor "novo" bate como
// itemId dinâmico e cai no detalhe do card, retornando 404).
export default async function NovoItemRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/bpo-financeiro/${id}/novo-item`);
}
