import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
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
      <PageHeader
        title="Treinamentos"
        subtitle={<>{treinamentos.length} treinamento{treinamentos.length !== 1 ? "s" : ""} cadastrado{treinamentos.length !== 1 ? "s" : ""}</>}
        action={<>{canManage && (
          <Button
            href="/treinamentos/novo"
            variant="primary" className="font-medium"
          >
            + Novo Treinamento
          </Button>
        )}</>}
      />
      {treinamentos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<GraduationCap />}
            title="Nenhum treinamento cadastrado"
            description="Cadastre treinamentos e organize turmas para os colaboradores."
            action={
              canManage && (
                <Button
                  href="/treinamentos/novo"
                  variant="primary" className="font-medium"
                >
                  + Novo Treinamento
                </Button>
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
