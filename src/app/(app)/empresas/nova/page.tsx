import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
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
      <Breadcrumb items={[{ label: "Empresas", href: "/empresas" }, { label: "Nova Empresa" }]} />

      <PageHeader title="Nova Empresa" />

      <div className="w-full max-w-[900px]">
        <EmpresaForm action={criarEmpresa} cancelHref="/empresas" branchOptions={branchOptions} />
      </div>
    </PageContainer>
  );
}
