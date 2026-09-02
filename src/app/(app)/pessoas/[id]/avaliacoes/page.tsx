import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";

export default async function AvaliacoesPessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    select: { id: true, name: true, isInternal: true },
  });
  if (!person) notFound();

  const evaluations = await prisma.evaluation.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { evaluationDate: "desc" },
    include: { cycle: { select: { id: true, name: true } } },
  });

  return (
    <PageContainer>
      <PessoaBreadcrumb
        isInternal={person.isInternal}
        personId={id}
        personName={person.name}
        atual="Avaliações de Desempenho"
      />
      <BackButton className="mb-3" />
      <PageHeader title="Avaliações de Desempenho" />

      <div className="bg-surface border border-border rounded-lg p-5">
        {evaluations.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Nenhuma avaliação registrada ainda.</p>
        ) : (
          <div className="divide-y divide-border">
            {evaluations.map((e) => (
              <div key={e.id} className="py-2.5">
                <div className="flex items-center justify-between">
                  <Link href={`/avaliacoes/${e.cycle.id}/avaliar/${id}`} className="text-[13px] text-brand hover:underline">
                    {e.cycle.name}
                  </Link>
                  <span className="text-[12px] text-fg-muted">
                    {e.averageScore != null ? `Média: ${e.averageScore.toString()}` : "Sem nota"}
                  </span>
                </div>
                {e.developmentPlan && (
                  <p className="text-[12px] text-fg-muted mt-0.5">Plano: {e.developmentPlan}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
