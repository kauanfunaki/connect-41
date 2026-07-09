import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { ItemForm } from "@/components/kanban/ItemForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarItem } from "../../actions";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedPipelineWhere, scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { getSectorUsers } from "@/lib/sectorUsers";

export default async function NovoItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id, ...scopedPipelineWhere(ctx) } });
  if (!pipeline) notFound();
  if (!canManageSector(ctx, pipeline.sectorCode)) notFound();

  const entities =
    pipeline.entityType === "COMPANY"
      ? await prisma.company.findMany({
          where: await scopedCompanyWhere(ctx),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : await prisma.person.findMany({
          where: await scopedPersonWhere(ctx),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        });

  const [tags, sectorUsers] = await Promise.all([
    prisma.tag.findMany({
      where: { tenantId: ctx.tenantId, sectorCode: pipeline.sectorCode },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    getSectorUsers(ctx.tenantId, pipeline.sectorCode),
  ]);

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/kanban" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Kanban
        </Link>
        <span className="text-fg-muted">/</span>
        <Link
          href={`/kanban/${id}`}
          className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]"
        >
          {pipeline.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Item</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">
        Adicionar {pipeline.entityType === "COMPANY" ? "Empresa" : "Pessoa"} ao Kanban
      </h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <ItemForm
          action={criarItem}
          pipelineId={id}
          entityType={pipeline.entityType}
          entities={entities}
          tags={tags}
          sectorUsers={sectorUsers}
          cancelHref={`/kanban/${id}`}
        />
      </div>
    </PageContainer>
  );
}
