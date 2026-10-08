import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { notaDoDP } from "@/components/pessoas/rotulosDoDP";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";

export default async function AvaliacoesPessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx } = await abrirTelaDoModulo("dp_avaliacoes");

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
        atual="Avaliações de desempenho"
      />
      <BackButton className="mb-3" />
      <PageHeader title="Avaliações de desempenho" />

      {evaluations.length === 0 ? (
        <Card className="p-5">
          <p className="text-fs-3 text-fg-muted">Nenhuma avaliação registrada ainda.</p>
        </Card>
      ) : (
        <>
          {/* No celular, um cartão por avaliação em vez da tabela de 560px com
              rolagem lateral (auditoria DRG-31, 07/10/2026). */}
          <CartoesNoCelular>
            {evaluations.map((e) => (
              <Cartao key={e.id}>
                <TopoDoCartao
                  nome={
                    <Link href={`/avaliacoes/${e.cycle.id}/avaliar/${id}`} className="text-fg hover:text-brand transition-colors">
                      {e.cycle.name}
                    </Link>
                  }
                  valor={e.averageScore != null ? notaDoDP(e.averageScore) : "Sem nota"}
                />
                {e.developmentPlan && <InfoDoCartao>{e.developmentPlan}</InfoDoCartao>}
              </Cartao>
            ))}
          </CartoesNoCelular>
          {/* Era uma lista de linhas com o ciclo em link azul (até 30/09); virou
              tabela no casco padrão, com funil na média. */}
          <TabelaFiltravel
            linhas={evaluations.map((e) => ({
              id: e.id,
              valores: { media: e.averageScore != null ? notaDoDP(e.averageScore) : "Sem nota" },
            }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
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
                        {e.averageScore != null ? notaDoDP(e.averageScore) : "Sem nota"}
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
            </TabelaNoDesktop>
          </TabelaFiltravel>
        </>
      )}
    </PageContainer>
  );
}
