import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { AssuntoForm } from "@/components/admin/AssuntoForm";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getActiveSectors } from "@/lib/sectors";
import { criarAssunto } from "../actions";

export default async function NovoAssuntoPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();
  const setores = (await getActiveSectors(ctx.tenantId)).map((s) => ({ value: s.code, label: s.label }));

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Assuntos das solicitações", href: "/admin/assuntos" }, { label: "Novo assunto" }]} />
      <PageHeader title="Novo assunto" />
      <div className="max-w-[720px]">
        <Card className="p-6">
          <AssuntoForm action={criarAssunto} cancelHref="/admin/assuntos" setores={setores} />
        </Card>
      </div>
    </PageContainer>
  );
}
