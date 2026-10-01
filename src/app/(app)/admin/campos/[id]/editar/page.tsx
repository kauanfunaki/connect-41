import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { CampoForm } from "@/components/admin/CampoForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { atualizarCampo } from "../../actions";
import { getAuthContext, canManageSector } from "@/lib/auth/context";

export default async function EditarCampoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const field = await prisma.customField.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!field) notFound();
  if (!canManageSector(ctx, field.sectorCode)) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Campos Customizados", href: "/admin/campos" }, { label: "Editar" }]} />
      <PageHeader title="Editar Campo" />

      <div className="max-w-[720px]">
        <Card className="p-6">
          <CampoForm
            action={atualizarCampo}
            cancelHref="/admin/campos"
            sectorOptions={[]}
            defaultValues={{
              id: field.id,
              sectorCode: field.sectorCode,
              entityType: field.entityType,
              label: field.label,
              fieldType: field.fieldType,
              options: Array.isArray(field.options) ? (field.options as string[]) : [],
              required: field.required,
              order: field.order,
            }}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
