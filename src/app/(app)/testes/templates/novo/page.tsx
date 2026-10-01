import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { TemplateForm } from "@/components/teste/TemplateForm";
import { criarTemplate } from "../actions";
import { setorDoModulo } from "@/lib/modules";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "recrutamento";
const MODULE = "recrutamento_testes";

export default async function NovoTemplatePage() {
  const ctx = await getAuthContext();
  if (!canManageSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Testes", href: "/testes" }, { label: "Modelos", href: "/testes/templates" }, { label: "Novo" }]} />
      <PageHeader title="Novo modelo de teste" />

      <Card className="p-6">
        <TemplateForm action={criarTemplate} cancelHref="/testes/templates" />
      </Card>
    </PageContainer>
  );
}
