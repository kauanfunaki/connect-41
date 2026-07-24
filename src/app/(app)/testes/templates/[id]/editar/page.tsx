import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { TemplateForm } from "@/components/teste/TemplateForm";
import { atualizarTemplate } from "../../actions";

export default async function EditarTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const template = await prisma.assessmentTemplate.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!template) notFound();
  if (!canManageSector(ctx, template.sectorCode)) notFound();

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/testes/templates" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Modelos
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar modelo de teste</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <TemplateForm
          action={atualizarTemplate}
          cancelHref="/testes/templates"
          defaults={{
            id: template.id,
            name: template.name,
            description: template.description ?? "",
            questions: template.questions.map((q) => ({
              text: q.text,
              options: q.options as string[],
              correctIndex: q.correctIndex,
            })),
          }}
        />
      </div>
    </PageContainer>
  );
}
