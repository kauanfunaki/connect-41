import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function TreinamentosPage() {
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const treinamentos = await prisma.training.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
    include: { _count: { select: { classes: true } } },
  });

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Treinamentos</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {treinamentos.length} treinamento{treinamentos.length !== 1 ? "s" : ""} cadastrado{treinamentos.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canManage && (
          <Link
            href="/treinamentos/novo"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Novo Treinamento
          </Link>
        )}
      </div>

      {treinamentos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<GraduationCap />}
            title="Nenhum treinamento cadastrado"
            description="Cadastre treinamentos e organize turmas para os colaboradores."
            action={
              canManage && (
                <Link
                  href="/treinamentos/novo"
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
                >
                  + Novo Treinamento
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {treinamentos.map((t) => (
            <Link
              key={t.id}
              href={`/treinamentos/${t.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <div>
                <p className="text-[13px] text-fg font-medium">{t.name}</p>
                {t.workloadHours && <p className="text-[12px] text-fg-muted">{t.workloadHours.toString()}h de carga horária</p>}
              </div>
              <span className="text-[12px] text-fg-muted">{t._count.classes} turma{t._count.classes !== 1 ? "s" : ""}</span>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
