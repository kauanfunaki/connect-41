import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { FilialForm } from "@/components/admin/FilialForm";
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
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/filiais" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Filiais
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Filial</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <FilialForm
          action={atualizarFilial}
          cancelHref="/admin/filiais"
          defaultValues={{ id: branch.id, name: branch.name, active: branch.active, order: branch.order }}
        />
      </div>
    </div>
  );
}
