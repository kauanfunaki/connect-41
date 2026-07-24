import Link from "next/link";
import { notFound } from "next/navigation";
import { FileQuestion } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { excluirTemplate, alternarAtivoTemplate } from "./actions";

const SECTOR = "recrutamento";

export default async function TemplatesPage() {
  const ctx = await getAuthContext();
  if (!canManageSector(ctx, SECTOR)) notFound();

  const prisma = getPrisma();
  const templates = await prisma.assessmentTemplate.findMany({
    where: { tenantId: ctx.tenantId, sectorCode: SECTOR },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { questions: true, links: true } } },
  });

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-3">
        <Link href="/testes" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Testes
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Modelos</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Modelos de teste</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {templates.length} modelo{templates.length !== 1 ? "s" : ""} — testes de múltipla escolha reutilizáveis (Português, Matemática...)
          </p>
        </div>
        <Link
          href="/testes/templates/novo"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
        >
          + Novo modelo
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<FileQuestion />}
            title="Nenhum modelo cadastrado"
            description="Crie um modelo de teste (ex: Português Básico) pra reaproveitar em vários candidatos."
            action={
              <Link
                href="/testes/templates/novo"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
              >
                + Novo modelo
              </Link>
            }
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[13px] text-fg font-medium">{t.name}</p>
                  {!t.active && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-fg-muted border border-border">
                      Arquivado
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-fg-muted">
                  {t._count.questions} pergunta{t._count.questions !== 1 ? "s" : ""} · usado {t._count.links} vez{t._count.links !== 1 ? "es" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Link href={`/testes/templates/${t.id}/editar`} className="text-[12px] text-fg-muted hover:text-fg transition-colors">
                  Editar
                </Link>
                <form action={alternarAtivoTemplate.bind(null, t.id)}>
                  <button type="submit" className="text-[12px] text-fg-muted hover:text-fg transition-colors">
                    {t.active ? "Arquivar" : "Reativar"}
                  </button>
                </form>
                {t._count.links === 0 && <DeleteFieldButton action={excluirTemplate.bind(null, t.id)} nome={t.name} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
