import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { notFound } from "next/navigation";
import { Network, Plus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, podeExcluir } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { AcoesDoCadastro } from "@/components/empresas/AcoesDoCadastro";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PainelDeCadastro } from "@/components/admin/PainelDeCadastro";
import { DepartmentForm } from "@/components/empresas/DepartmentForm";
import { excluirDepartment, criarDepartment, atualizarDepartment } from "./actions";

export default async function DepartamentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ novo?: string; editar?: string }>;
}) {
  const { id: companyId } = await params;
  // Criar e editar no painel ao lado (lote 5, 28/10/2026) — ver `PainelDeCadastro`.
  const { novo, editar } = await searchParams;
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

  const listaHref = `/empresas/${companyId}/departamentos`;
  const novoHref = `${listaHref}?novo=1`;
  const emEdicao = canManage && editar ? departments.find((x) => x.id === editar) : undefined;

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
          {/* Sem repetir o "Novo departamento": ele mora no cabeçalho, e o texto diz onde (P19, 15/10/2026). */}
          <EmptyState
            icon={<Network />}
            title="Nenhum departamento cadastrado"
            description={
              canManage
                ? "Use “+ Novo departamento”, no alto da tela, para organizar os colaboradores desta empresa em departamentos e facilitar a gestão e os relatórios."
                : "Os departamentos desta empresa aparecem aqui quando forem cadastrados."
            }
          />
        </Card>
      ) : (
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
          {departments.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="text-fs-3 text-fg font-medium">{d.name}</p>
              {canManage && (
                <AcoesDoCadastro editarHref={`${listaHref}?editar=${d.id}`} excluir={podeExcluir(ctx) ? excluirDepartment.bind(null, d.id, companyId) : undefined} nome={d.name} />
              )}
            </div>
          ))}
        </div>
      )}
      {canManage && novo === "1" && (
        <PainelDeCadastro titulo="Novo departamento" voltarPara={listaHref}>
          <DepartmentForm action={criarDepartment} companyId={companyId} cancelHref={listaHref} />
        </PainelDeCadastro>
      )}
      {emEdicao && (
        <PainelDeCadastro titulo="Editar departamento" voltarPara={listaHref}>
          <DepartmentForm key={emEdicao.id} action={atualizarDepartment} companyId={companyId} cancelHref={listaHref} defaultValues={{ id: emEdicao.id, name: emEdicao.name }} />
        </PainelDeCadastro>
      )}
    </PageContainer>
  );
}
