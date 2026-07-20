import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { AddCompetenciaForm } from "@/components/admin/AddCompetenciaForm";
import { CompetenciaRow } from "@/components/admin/CompetenciaRow";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { criarCompetencia, atualizarCompetencia, excluirCompetencia } from "./actions";

export default async function CompetenciasPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const competencias = await prisma.competency.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
  });

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Competências</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {competencias.length} competência{competencias.length !== 1 ? "s" : ""} cadastrada{competencias.length !== 1 ? "s" : ""} — usadas nas avaliações de desempenho
        </p>
      </div>

      <AddCompetenciaForm action={criarCompetencia} />

      {competencias.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<Star />}
            title="Nenhuma competência cadastrada"
            description="Use o formulário acima para cadastrar as competências usadas nas avaliações de desempenho."
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {competencias.map((c) => (
            <CompetenciaRow
              key={c.id}
              competencia={c}
              updateAction={atualizarCompetencia}
              deleteAction={excluirCompetencia.bind(null, c.id)}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
