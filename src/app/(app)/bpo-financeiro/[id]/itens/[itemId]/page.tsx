import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";
import { KanbanItemDetail } from "@/components/kanban/KanbanItemDetail";
import { PageContainer } from "@/components/shared/PageContainer";

export default async function BpoItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id, sectorCode: "bpo", ...scopedPipelineWhere(ctx) } });
  if (!pipeline) notFound();

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/bpo-financeiro" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          BPO Financeiro
        </Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/bpo-financeiro/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[160px]">
          {pipeline.name}
        </Link>
      </div>
      <KanbanItemDetail id={id} itemId={itemId} showBreadcrumb={false} />
    </PageContainer>
  );
}
