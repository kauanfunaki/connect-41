import Link from "next/link";
import { notFound } from "next/navigation";
import { Network } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackButton } from "@/components/shared/BackButton";
import { excluirDepartment } from "./actions";

export default async function DepartamentosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const departments = await prisma.department.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: { name: "asc" },
  });

  const novoHref = `/empresas/${companyId}/departamentos/novo`;

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${companyId}`, truncate: true },
          { label: "Departamentos" },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader
        title="Departamentos"
        subtitle={`${departments.length} departamento${departments.length !== 1 ? "s" : ""} cadastrado${departments.length !== 1 ? "s" : ""} nesta empresa`}
        action={
          canManage && (
            <Link
              href={novoHref}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
            >
              + Novo Departamento
            </Link>
          )
        }
      />

      {departments.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<Network />}
            title="Nenhum departamento cadastrado"
            description="Organize os colaboradores desta empresa em departamentos para facilitar a gestão e os relatórios."
            action={
              canManage && (
                <Link
                  href={novoHref}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
                >
                  + Cadastrar departamento
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {departments.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-4 py-3">
              <p className="text-[13px] text-fg font-medium">{d.name}</p>
              {canManage && (
                <div className="flex items-center gap-3">
                  <Link
                    href={`/empresas/${companyId}/departamentos/${d.id}/editar`}
                    className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                  >
                    Editar
                  </Link>
                  <DeleteFieldButton action={excluirDepartment.bind(null, d.id, companyId)} nome={d.name} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
