import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { SetorForm } from "@/components/admin/SetorForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { atualizarSetor } from "../../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

export default async function EditarSetorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const sector = await prisma.sector.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!sector) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Setores", href: "/admin/setores" }, { label: "Editar" }]} />
      <PageHeader title="Editar Setor" />

      <div className="max-w-[720px]">
        <Card className="p-6">
          <SetorForm
            action={atualizarSetor}
            cancelHref="/admin/setores"
            defaultValues={{
              id: sector.id,
              code: sector.code,
              label: sector.label,
              color: sector.color,
              active: sector.active,
              order: sector.order,
            }}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
