import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { EvaluationForm } from "@/components/avaliacoes/EvaluationForm";
import { registrarAvaliacao } from "./actions";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function AvaliarColaboradorPage({
  params,
}: {
  params: Promise<{ id: string; personId: string }>;
}) {
  const { id: cycleId, personId } = await params;
  const { ctx, setor } = await abrirTelaDoModulo("dp_avaliacoes");
  if (!canManageSector(ctx, setor)) notFound();

  const prisma = getPrisma();
  const [cycle, person, competencies, existing] = await Promise.all([
    prisma.evaluationCycle.findFirst({ where: { id: cycleId, tenantId: ctx.tenantId } }),
    prisma.person.findFirst({ where: { id: personId, tenantId: ctx.tenantId }, select: { id: true, name: true } }),
    prisma.competency.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    prisma.evaluation.findFirst({
      where: { cycleId, personId, tenantId: ctx.tenantId },
      include: { scores: true },
    }),
  ]);
  if (!cycle || !person) notFound();

  const action = registrarAvaliacao.bind(null, cycleId, personId);

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Avaliações", href: "/avaliacoes" },
          { label: cycle.name, href: `/avaliacoes/${cycleId}`, truncate: true },
          { label: person.name },
        ]}
      />
      <PageHeader title={`Avaliar ${person.name}`} />

      {competencies.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Star />}
            title="Nenhuma competência cadastrada ainda."
            description="Cadastre em Admin → Competências antes de avaliar."
          />
        </Card>
      ) : (
        <Card className="p-6">
          <EvaluationForm
            action={action}
            competencies={competencies}
            cancelHref={`/avaliacoes/${cycleId}`}
            defaultValues={{
              notes: existing?.notes ?? undefined,
              developmentPlan: existing?.developmentPlan ?? undefined,
              improvementDeadline: existing?.improvementDeadline?.toISOString().slice(0, 10),
              scores: existing
                ? Object.fromEntries(existing.scores.map((s) => [s.competencyId, s.score.toString()]))
                : undefined,
            }}
          />
        </Card>
      )}
    </PageContainer>
  );
}
