import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Kanban", href: "/kanban" },
          { label: pipeline.name, href: `/kanban/${id}`, truncate: true },
          { label: "Nova tarefa" },
        ]}
      />
      {/* "Tarefa" é o nome do que o kanban guarda, no quadro, na lista e no
          Meu dia (padrão aceito em 08/10/2026) — aqui era "Item" no botão e
          "Adicionar Empresa ao Kanban" no título. */}
      <PageHeader
        title="Nova tarefa"
        subtitle={pipeline.entityType === "COMPANY" ? "Cada tarefa deste kanban é de uma empresa." : "Cada tarefa deste kanban é de uma pessoa."}
      />

      {/* No cartão de 720px dos formulários curtos (30/09): na largura da
          tela, o select da empresa ia de uma borda à outra. */}
      <Card className="p-6 w-full max-w-[720px]">
        <ItemForm
          action={criarItem}
          pipelineId={id}
          entityType={pipeline.entityType}
          entities={entities}
          tags={tags}
          sectorUsers={sectorUsers}
          cancelHref={`/kanban/${id}`}
        />
      </Card>
    </PageContainer>
  );
}
