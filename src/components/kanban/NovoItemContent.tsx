import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { ItemForm } from "@/components/kanban/ItemForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarItem } from "@/app/(app)/kanban/actions";
import { NovoItemModal } from "@/components/kanban/NovoItemModal";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { accessiblePipelineWhere, scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { getSectorUsers } from "@/lib/sectorUsers";

export async function NovoItemContent({ id, estagio, emModal = false }: { id: string; estagio?: string; emModal?: boolean }) {
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id, ...accessiblePipelineWhere(ctx) }, include: { stages: { orderBy: { order: "asc" } } } });
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

  const formulario = (
    <ItemForm
      action={criarItem}
      emModal={emModal}
      pipelineId={id}
      stages={pipeline.stages}
      initialStageId={pipeline.stages.some((s) => s.id === estagio) ? estagio : undefined}
      entityType={pipeline.entityType}
      entities={entities}
      tags={tags}
      sectorUsers={sectorUsers}
      cancelHref={`/kanban/${id}`}
    />
  );
  if (emModal) return <NovoItemModal>{formulario}</NovoItemModal>;
  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Kanban", href: "/kanban" },
          { label: pipeline.name, href: `/kanban/${id}`, truncate: true },
          { label: "Nova tarefa" },
        ]}
      />
      <PageHeader title="Nova tarefa" />

      {/* No cartão de 720px dos formulários curtos (30/09): na largura da
          tela, o select da empresa ia de uma borda à outra. */}
      <Card className="p-6 w-full max-w-[720px]">
        {formulario}
      </Card>
    </PageContainer>
  );
}
