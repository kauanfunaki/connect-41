import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { excluirCiclo, encerrarCiclo } from "../actions";
import { SelecionarColaboradorForm } from "@/components/avaliacoes/SelecionarColaboradorForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";
import { notaDoDP } from "@/components/pessoas/rotulosDoDP";
import { saoPauloParts } from "@/lib/agenda";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { TabelaNoDesktop, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";

export default async function CicloPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, setor } = await abrirTelaDoModulo("dp_avaliacoes");
  const canManage = canManageSector(ctx, setor);

  const prisma = getPrisma();
  const ciclo = await prisma.evaluationCycle.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      evaluations: {
        orderBy: { evaluationDate: "desc" },
        include: { person: { select: { id: true, name: true } } },
      },
    },
  });
  if (!ciclo) notFound();

  const evaluatedIds = new Set(ciclo.evaluations.map((e) => e.personId));
  const colaboradores = await prisma.person.findMany({
    where: { tenantId: ctx.tenantId, type: "COLABORADOR", active: true, id: { notIn: [...evaluatedIds] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const deleteAction = excluirCiclo.bind(null, id);
  const encerrarAction = encerrarCiclo.bind(null, id);

  const media = (e: (typeof ciclo.evaluations)[number]) =>
    e.averageScore != null ? notaDoDP(e.averageScore) : "Sem nota";

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Avaliações", href: "/avaliacoes" }, { label: ciclo.name, truncate: true }]} />

      {/* Período e ações iam num cabeçalho montado à mão (até 30/09). */}
      <PageHeader
        title={ciclo.name}
        subtitle={
          <>
            {formatCalendarDate(ciclo.startDate)}
            {ciclo.endDate && ` — ${formatCalendarDate(ciclo.endDate)}`}
          </>
        }
        // A situação do ciclo no `Selo`, como na lista — era " · Encerrado" no
        // fim do período, e o aberto não dizia nada (2A, 08/10/2026).
        meta={
          ciclo.active ? <Selo tom="sucesso">Aberto</Selo> : <Selo tom="neutro">Encerrado</Selo>
        }
        action={
          canManage && (
            <div className="flex items-center gap-2">
              {ciclo.active && (
                <form action={encerrarAction}>
                  <Button variant="secondary" size="sm" type="submit">
                    <Lock size={14} />
                    Encerrar ciclo
                  </Button>
                </form>
              )}
              <DeleteButton action={deleteAction} nome={ciclo.name} />
            </div>
          )
        }
      />

      <Card className="p-5">
        <h2 className="text-section font-semibold text-fg mb-3">
          Avaliações {ciclo.evaluations.length > 0 && `(${ciclo.evaluations.length})`}
        </h2>

        {ciclo.evaluations.length === 0 ? (
          <p className="text-ui text-fg-muted mb-3">Nenhuma avaliação registrada ainda.</p>
        ) : (
          <>
            {/* No celular, uma linha por avaliação em vez da tabela de 560px com
                rolagem lateral (auditoria DRG-31, 07/10/2026). Já dentro do
                cartão, então linhas com divisória, sem cartão em cada uma. */}
            <ul className="md:hidden divide-y divide-border border-y border-border mb-4">
              {ciclo.evaluations.map((e) => (
                <li key={e.id} className="py-2.5">
                  <TopoDoCartao
                    nome={
                      canManage ? (
                        <Link href={`/avaliacoes/${id}/avaliar/${e.person.id}`} className="text-fg hover:text-brand transition-colors">
                          {e.person.name}
                        </Link>
                      ) : (
                        e.person.name
                      )
                    }
                    valor={media(e)}
                  />
                  <InfoDoCartao>Avaliado em {formatInstantDate(e.evaluationDate)}</InfoDoCartao>
                </li>
              ))}
            </ul>
            {/* Era uma lista de linhas-link (até 30/09); virou tabela com funil.
                A tela de avaliar só abre para quem edita — o botão segue a regra. */}
            <TabelaFiltravel
              linhas={ciclo.evaluations.map((e) => ({
                id: e.id,
                valores: { media: media(e), data: saoPauloParts(e.evaluationDate).dateKey },
              }))}
            >
              <TabelaNoDesktop className="c41-tabela rounded-lg border border-border mb-4">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
                      <th className="px-4 py-3">Colaborador</th>
                      <th className="px-4 py-3">
                        <FiltroDaColuna rotulo="Média" chave="media" />
                      </th>
                      <th className="px-4 py-3">
                        <FiltroDaColuna rotulo="Avaliado em" chave="data" tipo="data" align="right" />
                      </th>
                      {canManage && (
                        <th className="px-4 py-3">
                          <span className="sr-only">Abrir</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {ciclo.evaluations.map((e) => (
                      <LinhaFiltravel key={e.id} id={e.id} className="border-b border-border">
                        <td className="px-4 py-3">
                          {canManage ? (
                            <Link
                              href={`/avaliacoes/${id}/avaliar/${e.person.id}`}
                              className="font-semibold text-fg hover:text-brand transition-colors"
                            >
                              {e.person.name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-fg">{e.person.name}</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 ${e.averageScore != null ? "text-fg-secondary" : "text-fg-muted"}`}>{media(e)}</td>
                        <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{formatInstantDate(e.evaluationDate)}</td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <Button href={`/avaliacoes/${id}/avaliar/${e.person.id}`} variant="secondary" size="xs">
                              Abrir <ArrowRight size={11} />
                            </Button>
                          </td>
                        )}
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </TabelaFiltravel>
          </>
        )}

        {canManage && ciclo.active && (
          <SelecionarColaboradorForm cycleId={id} colaboradores={colaboradores} />
        )}
      </Card>
    </PageContainer>
  );
}
