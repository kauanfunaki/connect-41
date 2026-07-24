import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { KanbanItemDetail } from "@/components/kanban/KanbanItemDetail";
import { PageContainer } from "@/components/shared/PageContainer";

export default async function BpoItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const ctx = await getAuthContext();
  // Ver bpo-financeiro/[id]/page.tsx — findFirst({sectorCode:"bpo", ...scopedPipelineWhere})
  // deixa o spread sobrescrever o "bpo" literal, checagem explícita corrige.
  if (!canViewSector(ctx, "bpo")) notFound();

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id, tenantId: ctx.tenantId, sectorCode: "bpo" } });
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
