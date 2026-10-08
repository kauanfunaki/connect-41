import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Star } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { AddCicloForm } from "@/components/avaliacoes/AddCicloForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { SeloDoDP } from "@/components/pessoas/rotulosDoDP";
import { formatCalendarDate } from "@/lib/format";
import { criarCiclo } from "./actions";

export default async function AvaliacoesPage() {
  const { ctx, setor } = await abrirTelaDoModulo("dp_avaliacoes");
  const canManage = canManageSector(ctx, setor);

  const prisma = getPrisma();
  const ciclos = await prisma.evaluationCycle.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { evaluations: true } } },
  });

  const periodo = (c: (typeof ciclos)[number]) =>
    `${formatCalendarDate(c.startDate)}${c.endDate ? ` — ${formatCalendarDate(c.endDate)}` : ""}`;
  const avaliacoes = (n: number) => `${n} avaliação${n !== 1 ? "ões" : ""}`;
  const selo = (ativo: boolean) =>
    ativo ? (
      <SeloDoDP cor="bg-success/10 text-success-fg border-success/25">Aberto</SeloDoDP>
    ) : (
      <SeloDoDP cor="bg-surface-2 text-fg-muted border-border">Encerrado</SeloDoDP>
    );

  return (
    <PageContainer>
      <PageHeader
        title="Avaliações de Desempenho"
        subtitle={<>{ciclos.length} ciclo{ciclos.length !== 1 ? "s" : ""} de avaliação</>}
      />

      {canManage && <AddCicloForm action={criarCiclo} />}

      {ciclos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Star />}
            title="Nenhum ciclo de avaliação criado"
            description={canManage ? "Use o formulário acima para abrir o primeiro ciclo de avaliação de desempenho." : "Nenhum ciclo de avaliação foi aberto ainda."}
          />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {ciclos.map((c) => (
              <Link key={c.id} href={`/avaliacoes/${c.id}`} className="block">
                <Cartao className="hover:border-brand/40 transition-colors">
                  <TopoDoCartao nome={c.name} />
                  <InfoDoCartao>{periodo(c)}</InfoDoCartao>
                  <PeDoCartao>
                    {selo(c.active)}
                    <span className="ml-auto text-[length:var(--fs-micro)] text-fg-muted">{avaliacoes(c._count.evaluations)}</span>
                  </PeDoCartao>
                </Cartao>
              </Link>
            ))}
          </CartoesNoCelular>

          {/* Era uma lista de linhas-link (até 30/09); virou tabela com funil.
              "Encerrado" era um sufixo no texto do período; virou coluna. */}
          <TabelaFiltravel
            linhas={ciclos.map((c) => ({
              id: c.id,
              valores: {
                inicio: c.startDate.toISOString().slice(0, 10),
                situacao: c.active ? "Aberto" : "Encerrado",
              },
            }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[720px] text-[length:var(--fs-ui)]">
                <thead>
                  <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">Ciclo</th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Período" chave="inicio" tipo="data" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                    </th>
                    <th className="px-4 py-3">Avaliações</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ciclos.map((c) => (
                    <LinhaFiltravel key={c.id} id={c.id} className="border-b border-border">
                      <td className="px-4 py-3">
                        <Link href={`/avaliacoes/${c.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">{periodo(c)}</td>
                      <td className="px-4 py-3">{selo(c.active)}</td>
                      <td className="px-4 py-3 text-fg-muted">{avaliacoes(c._count.evaluations)}</td>
                      <td className="px-4 py-3">
                        <Button href={`/avaliacoes/${c.id}`} variant="secondary" size="xs">
                          Abrir <ArrowRight size={11} />
                        </Button>
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
