import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClienteForm } from "@/components/clientes/ClienteForm";
import { criarCliente } from "../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";

export default async function NovoClientePage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  return (
    <PageContainer variant="narrow">
      <Breadcrumb items={[{ label: "Cadastros", href: "/clientes" }, { label: "Clientes", href: "/clientes" }, { label: "Novo Cliente" }]} />
      <BackButton className="mb-3" />
      <PageHeader title="Novo Cliente" />
      <ClienteForm action={criarCliente} cancelHref="/clientes" />
    </PageContainer>
  );
}
