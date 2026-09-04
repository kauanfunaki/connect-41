import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FinanceCategoryForm } from "@/components/admin/FinanceCategoryForm";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { criarCategoria } from "../actions";

export default async function NovaCategoriaPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const grupos = await prisma.financeCategory.findMany({
    where: { tenantId: ctx.tenantId, dreGroup: { not: null } },
    select: { dreGroup: true },
    distinct: ["dreGroup"],
    orderBy: { dreGroup: "asc" },
  });

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
          gruposExistentes={grupos.map((g) => g.dreGroup!).filter(Boolean)}
        />
      </Card>
    </PageContainer>
  );
}
