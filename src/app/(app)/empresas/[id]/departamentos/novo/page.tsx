import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { DepartmentForm } from "@/components/empresas/DepartmentForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { criarDepartment } from "../actions";

export default async function NovoDepartmentPage({
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
          { label: "Departamentos", href: `/empresas/${companyId}/departamentos` },
          { label: "Novo" },
        ]}
      />

      <PageHeader title="Novo departamento" subtitle={company.name} />

      <div className="w-full max-w-[720px]">
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-6">
          <DepartmentForm action={criarDepartment} companyId={companyId} cancelHref={`/empresas/${companyId}/departamentos`} />
        </div>
      </div>
    </PageContainer>
  );
}
