import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { EvaluationForm } from "@/components/avaliacoes/EvaluationForm";
import { registrarAvaliacao } from "./actions";
import { PageContainer } from "@/components/shared/PageContainer";

export default async function AvaliarColaboradorPage({
  params,
}: {
  params: Promise<{ id: string; personId: string }>;
}) {
  const { id: cycleId, personId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

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
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/avaliacoes" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Avaliações</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/avaliacoes/${cycleId}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">{cycle.name}</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">{person.name}</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Avaliar {person.name}</h1>

      {competencies.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhuma competência cadastrada ainda. Cadastre em Admin → Competências antes de avaliar.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-6">
          <EvaluationForm
            action={action}
            competencies={competencies}
            defaultValues={{
              notes: existing?.notes ?? undefined,
              developmentPlan: existing?.developmentPlan ?? undefined,
              improvementDeadline: existing?.improvementDeadline?.toISOString().slice(0, 10),
              scores: existing
                ? Object.fromEntries(existing.scores.map((s) => [s.competencyId, s.score.toString()]))
                : undefined,
            }}
          />
        </div>
      )}
    </PageContainer>
  );
}
