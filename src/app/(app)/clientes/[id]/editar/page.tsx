import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClienteForm } from "@/components/clientes/ClienteForm";
import { atualizarCliente } from "../../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const cliente = await prisma.clientGroup.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!cliente) notFound();

  return (
    <PageContainer variant="narrow">
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/clientes" },
          { label: "Clientes", href: "/clientes" },
          { label: cliente.name, truncate: true },
        ]}
      />
      <BackButton className="mb-3" />
      <PageHeader title="Editar Cliente" />
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
    </PageContainer>
  );
}
