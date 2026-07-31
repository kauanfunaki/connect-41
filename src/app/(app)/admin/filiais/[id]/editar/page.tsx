import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { FilialForm } from "@/components/admin/FilialForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { atualizarFilial } from "../../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

export default async function EditarFilialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const branch = await prisma.branch.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!branch) notFound();

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/filiais" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Filiais
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>
      <PageHeader title="Editar Filial" />

      <Card className="p-6">
        <FilialForm
          action={atualizarFilial}
          cancelHref="/admin/filiais"
          defaultValues={{ id: branch.id, name: branch.name, active: branch.active, order: branch.order }}
        />
      </Card>
    </PageContainer>
  );
}
