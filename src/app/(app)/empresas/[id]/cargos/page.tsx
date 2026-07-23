import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackButton } from "@/components/shared/BackButton";
import { excluirCargo } from "./actions";

export default async function CargosPage({
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

  const cargos = await prisma.cargo.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: { name: "asc" },
  });

  const novoHref = `/empresas/${companyId}/cargos/novo`;

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${companyId}`, truncate: true },
          { label: "Cargos" },
        ]}
      />

      <PageHeader
        title="Cargos"
        subtitle={`${cargos.length} cargo${cargos.length !== 1 ? "s" : ""} cadastrado${cargos.length !== 1 ? "s" : ""} nesta empresa`}
        action={
          canManage && (
            <Link
              href={novoHref}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
            >
              + Novo Cargo
            </Link>
          )
        }
      />

      {cargos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<Briefcase />}
            title="Nenhum cargo cadastrado"
            description="Cadastre os cargos desta empresa para organizar faixas salariais, requisitos e a estrutura de colaboradores."
            action={
              canManage && (
                <Link
                  href={novoHref}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
                >
                  + Cadastrar cargo
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {cargos.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] text-fg font-medium">{c.name}</p>
                {c.area && <p className="text-[12px] text-fg-muted">{c.area}</p>}
              </div>
              {canManage && (
                <div className="flex items-center gap-3">
                  <Link
                    href={`/empresas/${companyId}/cargos/${c.id}/editar`}
                    className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                  >
                    Editar
                  </Link>
                  <DeleteFieldButton action={excluirCargo.bind(null, c.id, companyId)} nome={c.name} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
