import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PessoaForm } from "@/components/pessoas/PessoaForm";
import { criarPessoa } from "../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";

export default async function NovaPessoaPage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const [companies, cargos, departments, canEditSensitive] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.cargo.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    prisma.department.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    canViewSensitiveField(ctx, "DADOS_BANCARIOS"),
  ]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Pessoas
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Nova Pessoa</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Nova Pessoa</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <PessoaForm
          action={criarPessoa}
          cancelHref="/pessoas"
          companies={companies}
          cargos={cargos}
          departments={departments}
          canEditSensitive={canEditSensitive}
        />
      </div>
    </div>
  );
}
