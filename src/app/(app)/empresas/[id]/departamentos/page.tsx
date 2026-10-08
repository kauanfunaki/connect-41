import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { notFound } from "next/navigation";
import { Network, Plus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { AcoesDoCadastro } from "@/components/empresas/AcoesDoCadastro";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
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
          { label: company.name, href: `/empresas/${companyId}?tab=operations`, truncate: true },
          { label: "Departamentos" },
        ]}
      />

      <PageHeader
        title="Departamentos"
        subtitle={`${departments.length} departamento${departments.length !== 1 ? "s" : ""} cadastrado${departments.length !== 1 ? "s" : ""} nesta empresa`}
        action={
          canManage && (
            <Button
              href={novoHref}
              variant="primary"
            >
              <Plus size={14} /> Novo departamento
            </Button>
          )
        }
      />

      {departments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Network />}
            title="Nenhum departamento cadastrado"
            description="Organize os colaboradores desta empresa em departamentos para facilitar a gestão e os relatórios."
            action={
              canManage && (
                <Button
                  href={novoHref}
                  variant="primary"
                >
                  <Plus size={14} /> Cadastrar departamento
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
          {departments.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="text-fs-3 text-fg font-medium">{d.name}</p>
              {canManage && (
                <AcoesDoCadastro editarHref={`/empresas/${companyId}/departamentos/${d.id}/editar`} excluir={excluirDepartment.bind(null, d.id, companyId)} nome={d.name} />
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
