import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
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
      <div className="flex items-center gap-2 mb-6">
        <Link href="/testes/templates" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Modelos
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo</span>
      </div>
      <PageHeader title="Novo modelo de teste" />

      <Card className="p-6">
        <TemplateForm action={criarTemplate} cancelHref="/testes/templates" />
      </Card>
    </PageContainer>
  );
}
