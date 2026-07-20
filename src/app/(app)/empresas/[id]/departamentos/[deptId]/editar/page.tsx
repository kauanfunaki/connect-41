import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { DepartmentForm } from "@/components/empresas/DepartmentForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { atualizarDepartment } from "../../actions";

export default async function EditarDepartmentPage({
  params,
}: {
  params: Promise<{ id: string; deptId: string }>;
}) {
  const { id: companyId, deptId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const department = await prisma.department.findFirst({ where: { id: deptId, tenantId: ctx.tenantId, companyId } });
  if (!department) notFound();

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <Breadcrumb
        items={[
          { label: "Empresas", href: "/empresas" },
          { label: "Departamentos", href: `/empresas/${companyId}/departamentos` },
          { label: "Editar" },
        ]}
      />

      <PageHeader title="Editar Departamento" subtitle={company.name} />

      <div className="w-full max-w-[720px]">
        <div className="bg-surface border border-border rounded-2xl p-6">
          <DepartmentForm
            action={atualizarDepartment}
            companyId={companyId}
            cancelHref={`/empresas/${companyId}/departamentos`}
            defaultValues={{ id: department.id, name: department.name }}
          />
        </div>
      </div>
    </PageContainer>
  );
}
