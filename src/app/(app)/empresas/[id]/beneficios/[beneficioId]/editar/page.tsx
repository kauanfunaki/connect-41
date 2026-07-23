import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { BenefitCatalogForm } from "@/components/empresas/BenefitCatalogForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { atualizarBeneficio } from "../../actions";

export default async function EditarBeneficioPage({
  params,
}: {
  params: Promise<{ id: string; beneficioId: string }>;
}) {
  const { id: companyId, beneficioId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const beneficio = await prisma.benefitCatalog.findFirst({ where: { id: beneficioId, tenantId: ctx.tenantId, companyId } });
  if (!beneficio) notFound();

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: "Benefícios", href: `/empresas/${companyId}/beneficios` },
          { label: "Editar" },
        ]}
      />

      <PageHeader title="Editar Benefício" subtitle={company.name} />

      <div className="w-full max-w-[720px]">
        <div className="bg-surface border border-border rounded-2xl p-6">
          <BenefitCatalogForm
            action={atualizarBeneficio}
            companyId={companyId}
            cancelHref={`/empresas/${companyId}/beneficios`}
            defaultValues={{
              id: beneficio.id,
              name: beneficio.name,
              type: beneficio.type,
              eligibilityRule: beneficio.eligibilityRule ?? undefined,
            }}
          />
        </div>
      </div>
    </PageContainer>
  );
}
