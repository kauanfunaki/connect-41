import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmpresaForm } from "@/components/empresas/EmpresaForm";
import { criarEmpresa } from "../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { getMatrizOptions } from "@/lib/companyHierarchyDb";
import { lerContabilistaPadrao } from "@/lib/empresas/contabilistaPadraoDb";
import { versaoDoLeiaute } from "@/lib/empresas/camposSped";

export default async function NovaEmpresaPage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const [matrizOptions, contabilista] = await Promise.all([
    getMatrizOptions(ctx.tenantId),
    lerContabilistaPadrao(ctx.tenantId),
  ]);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Cadastros", href: "/empresas" }, { label: "Empresas", href: "/empresas" }, { label: "Nova empresa" }]} />


      <PageHeader title="Nova empresa" />

      <EmpresaForm
        action={criarEmpresa}
        cancelHref="/empresas"
        matrizOptions={matrizOptions}
        // Empresa nova: a versão do leiaute do ano e o contabilista padrão do
        // escritório, se ele configurou. Tudo editável e opcional.
        defaultValues={{
          spedCodVersao: versaoDoLeiaute(new Date().getFullYear()),
          contabilistaNome: contabilista.contabilistaNome ?? undefined,
          contabilistaCpf: contabilista.contabilistaCpf ?? undefined,
          contabilistaCrc: contabilista.contabilistaCrc ?? undefined,
        }}
      />
    </PageContainer>
  );
}
