import { notFound, redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { boardPath } from "@/lib/kanbanPaths";

// O card pelo id, sem saber a lista — o link das notificações de menção e
// comentário (02/10/2026). Acha a lista e redireciona para a tela do card, que
// é quem confere se a pessoa pode vê-lo.
export default async function CardPeloId({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const item = await getPrisma().pipelineItem.findFirst({
    where: { id: itemId, tenantId: ctx.tenantId },
    select: { id: true, pipeline: { select: { id: true } } },
  });
  if (!item) notFound();
  redirect(`${boardPath(item.pipeline)}/itens/${item.id}`);
}
