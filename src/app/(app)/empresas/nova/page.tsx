import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmpresaForm } from "@/components/empresas/EmpresaForm";
import { criarEmpresa } from "../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { getActiveBranchOptions } from "@/lib/branches";

export default async function NovaEmpresaPage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const branchOptions = await getActiveBranchOptions(ctx.tenantId);

  return (
    <PageContainer>
      <div className="max-w-[1000px] mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/empresas"
            className="text-[13px] text-fg-muted hover:text-fg transition-colors"
          >
            Empresas
          </Link>
          <span className="text-fg-muted">/</span>
          <span className="text-[13px] text-fg">Nova Empresa</span>
        </div>

        <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em] mb-6">
          Nova Empresa
        </h1>

        <EmpresaForm action={criarEmpresa} cancelHref="/empresas" branchOptions={branchOptions} />
      </div>
    </PageContainer>
  );
}
