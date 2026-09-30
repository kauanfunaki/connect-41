import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";

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

      {evaluations.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5">
          <p className="text-[13px] text-fg-muted">Nenhuma avaliação registrada ainda.</p>
        </div>
      ) : (
        // Era uma lista de linhas com o ciclo em link azul (até 30/09); virou
        // tabela no casco padrão, com funil na média.
        <TabelaFiltravel
          linhas={evaluations.map((e) => ({
            id: e.id,
            valores: { media: e.averageScore != null ? e.averageScore.toString() : "Sem nota" },
          }))}
        >
          <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
            <table className="w-full min-w-[560px] text-[length:var(--fs-ui)]">
              <thead>
                <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-3">Ciclo</th>
                  <th className="px-4 py-3">
                    <FiltroDaColuna rotulo="Média" chave="media" />
                  </th>
                  <th className="px-4 py-3">Plano de desenvolvimento</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((e) => (
                  <LinhaFiltravel key={e.id} id={e.id} className="border-b border-border">
                    <td className="px-4 py-3">
                      <Link
                        href={`/avaliacoes/${e.cycle.id}/avaliar/${id}`}
                        className="font-semibold text-fg hover:text-brand transition-colors"
                      >
                        {e.cycle.name}
                      </Link>
                    </td>
                    <td className={`px-4 py-3 ${e.averageScore != null ? "text-fg-secondary" : "text-fg-muted"}`}>
                      {e.averageScore != null ? e.averageScore.toString() : "Sem nota"}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      <span className="block max-w-[360px] truncate" title={e.developmentPlan ?? undefined}>
                        {e.developmentPlan ?? "—"}
                      </span>
                    </td>
                  </LinhaFiltravel>
                ))}
              </tbody>
            </table>
          </div>
        </TabelaFiltravel>
      )}
    </PageContainer>
  );
}
