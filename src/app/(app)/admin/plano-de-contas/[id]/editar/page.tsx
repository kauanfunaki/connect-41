import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FinanceCategoryForm } from "@/components/admin/FinanceCategoryForm";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { atualizarCategoria } from "../../actions";

export default async function EditarCategoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const categoria = await prisma.financeCategory.findFirst({
    where: { id, tenantId: ctx.tenantId, companyId: null },
  });
  if (!categoria) notFound();


  return (
    <PageContainer>
      <PageHeader title="Editar categoria" />

      <div className="max-w-[720px]">
        <Card className="p-6">
          <FinanceCategoryForm
            action={atualizarCategoria}
            cancelHref="/admin/plano-de-contas"
            defaultValues={{
              id: categoria.id,
              name: categoria.name,
              kind: categoria.kind,
              dreGroup: categoria.dreGroup,
            }}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
