import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FinanceCategoryForm } from "@/components/admin/FinanceCategoryForm";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { criarCategoria } from "../actions";

export default async function NovaCategoriaPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/admin/plano-de-contas"
          className="text-[13px] text-fg-muted hover:text-fg transition-colors"
        >
          Plano de contas
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Nova categoria</span>
      </div>
      <PageHeader title="Nova categoria" />

      <Card className="p-6">
        <FinanceCategoryForm
          action={criarCategoria}
          cancelHref="/admin/plano-de-contas"
        />
      </Card>
    </PageContainer>
  );
}
