import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ClienteForm } from "@/components/clientes/ClienteForm";
import { EmpresasDoCliente } from "@/components/clientes/EmpresasDoCliente";
import { BotaoExcluirCliente } from "@/components/clientes/ExclusaoDeCliente";
import {
  atualizarCliente,
  vincularEmpresasAoCliente,
  desvincularEmpresaDoCliente,
  resumoDoClienteParaExcluir,
  excluirCliente,
} from "../../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { cnpjRoot } from "@/lib/clientGroups";
import { nomeExibicao } from "@/lib/companyName";
import { formatCnpj } from "@/lib/format";
import { podeExcluirDeVerdade } from "@/lib/exclusaoConfirmada";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const cliente = await prisma.clientGroup.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { _count: { select: { portalUsers: true } } },
  });
  if (!cliente) notFound();

  // Todas as empresas do escritório, num select só: as do cliente vão para a
  // lista, as outras para o "Adicionar" (são ~400 — cabe na tela, como no
  // seletor de matriz do cadastro de empresa).
  const todas = await prisma.company.findMany({
    where: await scopedCompanyWhere(ctx),
    orderBy: { name: "asc" },
    select: { id: true, name: true, displayName: true, cnpj: true, clientGroupId: true, clientGroup: { select: { name: true } } },
  });
  const doCliente = todas.filter((e) => e.clientGroupId === cliente.id);
  const outras = todas.filter((e) => e.clientGroupId !== cliente.id);
  const sugeridas = cliente.cnpjRoot ? outras.filter((e) => cnpjRoot(e.cnpj) === cliente.cnpjRoot).map((e) => e.id) : [];

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/clientes" },
          { label: "Clientes", href: "/clientes" },
          { label: cliente.name, truncate: true },
        ]}
      />
      <PageHeader
        title="Editar cliente"
        action={
          podeExcluirDeVerdade(ctx) && (
            <BotaoExcluirCliente
              cliente={{ id: cliente.id, nome: cliente.name }}
              resumoAction={resumoDoClienteParaExcluir}
              excluirAction={excluirCliente}
            />
          )
        }
      />
      <div className="w-full max-w-[720px] space-y-5">
        <Card className="p-6">
          <ClienteForm
            action={atualizarCliente}
            cancelHref="/clientes"
            defaultValues={{
              id: cliente.id,
              name: cliente.name,
              cnpjRoot: cliente.cnpjRoot ?? undefined,
              active: cliente.active,
            }}
          />
        </Card>
        <Card className="p-6">
          <EmpresasDoCliente
            cliente={{ id: cliente.id, nome: cliente.name, raizLabel: cliente.cnpjRoot ? formatCnpj(cliente.cnpjRoot) : null }}
            empresas={doCliente.map((e) => ({ id: e.id, nome: nomeExibicao(e), cnpj: e.cnpj }))}
            opcoes={outras.map((e) => ({ id: e.id, nome: nomeExibicao(e), cnpj: e.cnpj, clienteAtual: e.clientGroup?.name ?? null }))}
            sugeridas={sugeridas}
            acessos={cliente._count.portalUsers}
            vincularAction={vincularEmpresasAoCliente}
            desvincularAction={desvincularEmpresaDoCliente}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
