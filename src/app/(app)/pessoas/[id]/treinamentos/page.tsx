import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { formatCalendarDate } from "@/lib/format";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { SITUACAO_DO_PARTICIPANTE, COR_DO_PARTICIPANTE, SeloDoDP } from "@/components/pessoas/rotulosDoDP";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";

export default async function TreinamentosPessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx } = await abrirTelaDoModulo("dp_treinamentos");

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    select: { id: true, name: true, isInternal: true },
  });
  if (!person) notFound();

  const trainingParticipations = await prisma.trainingParticipant.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { createdAt: "desc" },
    include: { class: { select: { id: true, date: true, training: { select: { id: true, name: true } } } } },
  });

  return (
    <PageContainer>
      <PessoaBreadcrumb
        isInternal={person.isInternal}
        personId={id}
        personName={person.name}
        atual="Treinamentos"
        aba="trabalhista"
      />
      <PageHeader title="Treinamentos" />

      {trainingParticipations.length === 0 ? (
        <Card className="p-5">
          <p className="text-fs-3 text-fg-muted">Nenhum treinamento registrado ainda.</p>
        </Card>
      ) : (
        <>
          {/* No celular, um cartão por participação em vez da tabela de 560px
              com rolagem lateral (auditoria DRG-31, 07/10/2026). */}
          <CartoesNoCelular>
            {trainingParticipations.map((p) => (
              <Cartao key={p.id}>
                <TopoDoCartao
                  nome={
                    <Link
                      href={`/treinamentos/${p.class.training.id}/turmas/${p.class.id}`}
                      className="text-fg hover:text-brand transition-colors"
                    >
                      {p.class.training.name}
                    </Link>
                  }
                />
                <InfoDoCartao>Turma de {formatCalendarDate(p.class.date)}</InfoDoCartao>
                <PeDoCartao>
                  <SeloDoDP cor={COR_DO_PARTICIPANTE[p.status]}>{SITUACAO_DO_PARTICIPANTE[p.status]}</SeloDoDP>
                </PeDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>
          {/* Era uma lista de linhas com o treinamento em link azul (até 30/09);
              virou tabela no casco padrão, com funil. */}
          <TabelaFiltravel
            linhas={trainingParticipations.map((p) => ({
              id: p.id,
              valores: {
                treinamento: p.class.training.name,
                turma: p.class.date.toISOString().slice(0, 10),
                situacao: SITUACAO_DO_PARTICIPANTE[p.status],
              },
            }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Treinamento" chave="treinamento" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Turma" chave="turma" tipo="data" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trainingParticipations.map((p) => (
                    <LinhaFiltravel key={p.id} id={p.id} className="border-b border-border">
                      <td className="px-4 py-3">
                        <Link
                          href={`/treinamentos/${p.class.training.id}/turmas/${p.class.id}`}
                          className="font-semibold text-fg hover:text-brand transition-colors"
                        >
                          {p.class.training.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{formatCalendarDate(p.class.date)}</td>
                      <td className="px-4 py-3">
                        <SeloDoDP cor={COR_DO_PARTICIPANTE[p.status]}>{SITUACAO_DO_PARTICIPANTE[p.status]}</SeloDoDP>
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
