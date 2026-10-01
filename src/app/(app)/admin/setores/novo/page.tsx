import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { SetorForm } from "@/components/admin/SetorForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { criarSetor } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

export default async function NovoSetorPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Setores", href: "/admin/setores" }, { label: "Novo Setor" }]} />
      <PageHeader title="Novo Setor" />

      <div className="max-w-[720px]">
        <Card className="p-6">
          <SetorForm action={criarSetor} cancelHref="/admin/setores" />
        </Card>
      </div>
    </PageContainer>
  );
}
