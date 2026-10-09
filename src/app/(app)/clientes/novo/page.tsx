import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ClienteForm } from "@/components/clientes/ClienteForm";
import { criarCliente } from "../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";

export default async function NovoClientePage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Cadastros", href: "/clientes" }, { label: "Clientes", href: "/clientes" }, { label: "Novo cliente" }]} />
      <PageHeader title="Novo cliente" />
      {/* No cartão de 720px dos outros cadastros curtos (30/09): solto na
          largura da tela, o nome ia de uma borda à outra. */}
      <div className="w-full max-w-[720px]">
        <Card className="p-6">
          <ClienteForm action={criarCliente} cancelHref="/clientes" />
        </Card>
      </div>
    </PageContainer>
  );
}
