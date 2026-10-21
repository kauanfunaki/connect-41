import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { notFound } from "next/navigation";
import { Briefcase, Plus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, podeExcluir } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { AcoesDoCadastro } from "@/components/empresas/AcoesDoCadastro";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
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
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${companyId}?tab=operations`, truncate: true },
          { label: "Cargos" },
        ]}
      />

      <PageHeader
        title="Cargos"
        subtitle={`${cargos.length} cargo${cargos.length !== 1 ? "s" : ""} cadastrado${cargos.length !== 1 ? "s" : ""} nesta empresa`}
        action={
          canManage && (
            <Button
              href={novoHref}
              variant="primary"
            >
              <Plus size={14} /> Novo cargo
            </Button>
          )
        }
      />

      {cargos.length === 0 ? (
        <Card>
          {/* Sem repetir o "Novo cargo": ele mora no cabeçalho, e o texto diz onde (P19, 15/10/2026). */}
          <EmptyState
            icon={<Briefcase />}
            title="Nenhum cargo cadastrado"
            description={
              canManage
                ? "Use “+ Novo cargo”, no alto da tela, para cadastrar os cargos desta empresa e organizar faixas salariais, requisitos e a estrutura de colaboradores."
                : "Os cargos desta empresa aparecem aqui quando forem cadastrados."
            }
          />
        </Card>
      ) : (
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
          {cargos.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-fs-3 text-fg font-medium">{c.name}</p>
                {c.area && <p className="text-fs-2 text-fg-muted">{c.area}</p>}
              </div>
              {canManage && (
                <AcoesDoCadastro editarHref={`/empresas/${companyId}/cargos/${c.id}/editar`} excluir={podeExcluir(ctx) ? excluirCargo.bind(null, c.id, companyId) : undefined} nome={c.name} />
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
