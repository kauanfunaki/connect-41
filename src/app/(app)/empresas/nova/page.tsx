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
      <Breadcrumb items={[{ label: "Cadastros", href: "/empresas" }, { label: "Empresas", href: "/empresas" }, { label: "Nova Empresa" }]} />

      <PageHeader title="Nova Empresa" />

      <EmpresaForm action={criarEmpresa} cancelHref="/empresas" branchOptions={branchOptions} />
    </PageContainer>
  );
}
