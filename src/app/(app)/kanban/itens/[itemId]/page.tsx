import { notFound, redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { boardPath } from "@/lib/kanbanPaths";
import { alvoDoEndereco, idCurto, textoDaBusca } from "@/lib/enderecoCurto";

// O card pelo id, sem saber a lista — o link das notificações de menção e
// comentário (02/10/2026). Acha a lista e redireciona para a tela do card, que
// é quem confere se a pessoa pode vê-lo.
//
// Desde 10/11/2026 (pedido do Kauan) é também o endereço curto da tarefa,
// /kanban/itens/tarefa-77: aceita o uuid ou o id curto e abre o card no quadro
// já pelo id curto, com a mesma query.
export default async function CardPeloId({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { itemId } = await params;
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const alvo = alvoDoEndereco("tarefa", itemId);
  if (!alvo) notFound();
  const item = await getPrisma().pipelineItem.findFirst({
    where: { ...alvo, tenantId: ctx.tenantId },
    select: { id: true, number: true, pipeline: { select: { id: true } } },
  });
  if (!item) notFound();
  redirect(`${boardPath(item.pipeline)}/itens/${idCurto("tarefa", item.number)}${textoDaBusca(await searchParams)}`);
}
