import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { FinanceCategoryForm } from "@/components/admin/FinanceCategoryForm";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { criarCategoria } from "../actions";

export default async function NovaCategoriaPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Plano de contas", href: "/admin/plano-de-contas" }, { label: "Nova categoria" }]} />
      <PageHeader title="Nova categoria" />

      <div className="max-w-[720px]">
        <Card className="p-6">
          <FinanceCategoryForm
            action={criarCategoria}
            cancelHref="/admin/plano-de-contas"
          />
        </Card>
      </div>
    </PageContainer>
  );
}
