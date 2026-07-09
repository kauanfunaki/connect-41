import { redirect } from "next/navigation";

// Rota movida para /kanban/[id]/novo-item — "itens/novo" colidia com a rota
// interceptada @modal/(.)itens/[itemId] (o valor "novo" batia como itemId
// dinâmico e caía no detalhe do card, retornando 404). Mantido como redirect
// para não quebrar links/favoritos antigos.
export default async function NovoItemRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/kanban/${id}/novo-item`);
}
