import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { BenefitCatalogForm } from "@/components/empresas/BenefitCatalogForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { criarBeneficio } from "../actions";

export default async function NovoBeneficioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${companyId}?tab=operations`, truncate: true },
          { label: "Benefícios", href: `/empresas/${companyId}/beneficios` },
          { label: "Novo" },
        ]}
      />

      <PageHeader title="Novo benefício" subtitle={company.name} />

      <div className="w-full max-w-[720px]">
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-6">
          <BenefitCatalogForm action={criarBeneficio} companyId={companyId} cancelHref={`/empresas/${companyId}/beneficios`} />
        </div>
      </div>
    </PageContainer>
  );
}
