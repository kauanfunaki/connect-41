import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { TemplateForm } from "@/components/teste/TemplateForm";
import { criarTemplate } from "../actions";

const SECTOR = "recrutamento";

export default async function NovoTemplatePage() {
  const ctx = await getAuthContext();
  if (!canManageSector(ctx, SECTOR)) notFound();

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/testes/templates" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Modelos
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Novo modelo de teste</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <TemplateForm action={criarTemplate} cancelHref="/testes/templates" />
      </div>
    </PageContainer>
  );
}
