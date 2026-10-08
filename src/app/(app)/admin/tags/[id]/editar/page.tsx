import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { TagForm } from "@/components/admin/TagForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { atualizarTag } from "../../actions";
import { getAuthContext, canManageSector } from "@/lib/auth/context";

export default async function EditarTagPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const tag = await prisma.tag.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!tag) notFound();
  if (!canManageSector(ctx, tag.sectorCode)) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Tags", href: "/admin/tags" }, { label: "Editar" }]} />
      <PageHeader title="Editar tag" />

      <div className="max-w-[720px]">
        <Card className="p-6">
          <TagForm
            action={atualizarTag}
            cancelHref="/admin/tags"
            sectorOptions={[]}
            defaultValues={{ id: tag.id, sectorCode: tag.sectorCode, name: tag.name, color: tag.color }}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
