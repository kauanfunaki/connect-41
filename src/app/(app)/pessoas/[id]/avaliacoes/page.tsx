import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
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
    select: { id: true, name: true },
  });
  if (!person) notFound();

  const evaluations = await prisma.evaluation.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { evaluationDate: "desc" },
    include: { cycle: { select: { id: true, name: true } } },
  });

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Pessoas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Avaliações de Desempenho</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Avaliações de Desempenho</h1>

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
