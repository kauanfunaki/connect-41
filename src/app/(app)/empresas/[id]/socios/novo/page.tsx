import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { SocioForm } from "@/components/empresas/SocioForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { criarSocio } from "../actions";

export default async function NovoSocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: {
      id: true,
      name: true,
      zipCode: true,
      addressStreet: true,
      addressNumber: true,
      addressComplement: true,
      neighborhood: true,
      city: true,
      stateCode: true,
    },
  });
  if (!company) notFound();

  const endereco = {
    zipCode: company.zipCode,
    addressStreet: company.addressStreet,
    addressNumber: company.addressNumber,
    addressComplement: company.addressComplement,
    neighborhood: company.neighborhood,
    city: company.city,
    stateCode: company.stateCode,
  };

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: "Sócios", href: `/empresas/${companyId}/socios` },
          { label: "Novo" },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader title="Novo Sócio" subtitle={company.name} />

      <div className="w-full max-w-[720px]">
        <div className="bg-surface border border-border rounded-lg p-6">
          <SocioForm
            action={criarSocio}
            companyId={companyId}
            enderecoDaEmpresa={endereco}
            cancelHref={`/empresas/${companyId}/socios`}
          />
        </div>
      </div>
    </PageContainer>
  );
}
