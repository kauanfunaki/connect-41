import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ArrowRight, ListChecks, Star } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { canManageSector, podeExcluir } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { NovoCiclo } from "@/components/avaliacoes/AddCicloForm";
import { NovaCompetencia } from "@/components/avaliacoes/AddCompetenciaForm";
import { CompetenciaRow, colunasDasCompetencias } from "@/components/avaliacoes/CompetenciaRow";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { SeloDoDP } from "@/components/pessoas/rotulosDoDP";
import { formatCalendarDate } from "@/lib/format";
import { atualizarCompetencia, criarCiclo, criarCompetencia, excluirCompetencia } from "./actions";

export default async function AvaliacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { ctx, setor } = await abrirTelaDoModulo("dp_avaliacoes");
  const canManage = canManageSector(ctx, setor);
  // Competências é uma aba daqui desde 20/10/2026 (escolha 8A dos Ajustes de
  // 15/10): era uma tela das Configurações, só do administrador.
  const aba = (await searchParams).aba === "competencias" ? "competencias" : "ciclos";

  const prisma = getPrisma();
  const [ciclos, competencias] = await Promise.all([
    prisma.evaluationCycle.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { startDate: "desc" },
      include: { _count: { select: { evaluations: true } } },
    }),
    prisma.competency.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
      include: { _count: { select: { scores: true } } },
    }),
  ]);

  const periodo = (c: (typeof ciclos)[number]) =>
    `${formatCalendarDate(c.startDate)}${c.endDate ? ` — ${formatCalendarDate(c.endDate)}` : ""}`;
  const avaliacoes = (n: number) => `${n} avaliação${n !== 1 ? "ões" : ""}`;
  const selo = (ativo: boolean) =>
    ativo ? (
      <SeloDoDP cor="bg-success/10 text-success-fg border-success/25">Aberto</SeloDoDP>
    ) : (
      <SeloDoDP cor="bg-surface-2 text-fg-muted border-border">Encerrado</SeloDoDP>
    );

  const abas = [
    { chave: "ciclos", rotulo: "Ciclos", href: "/avaliacoes", contagem: ciclos.length },
    { chave: "competencias", rotulo: "Competências", href: "/avaliacoes?aba=competencias", contagem: competencias.length },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Avaliações de desempenho"
        subtitle={
          aba === "competencias"
            ? "O que se avalia em cada ciclo, com a nota de 0 a 10 de cada competência."
            : "Os ciclos de avaliação e as competências avaliadas em cada um."
        }
        // O criar no cabeçalho, com o formulário numa janela — era um formulário
        // aberto no topo da lista (escolha 5A do Kauan, 08/10/2026). Cada aba
        // cria o que ela lista.
        action={
          !canManage ? undefined : aba === "competencias" ? (
            <NovaCompetencia action={criarCompetencia} />
          ) : (
            <NovoCiclo action={criarCiclo} />
          )
        }
      />

      <AbasDeLink abas={abas} ativa={aba} />

      {aba === "competencias" ? (
        <AbaDasCompetencias competencias={competencias} podeEditar={canManage} podeApagar={canManage && podeExcluir(ctx)} />
      ) : ciclos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Star />}
            title="Nenhum ciclo de avaliação criado"
            description={canManage ? "Abra o primeiro ciclo de avaliação de desempenho em “Novo ciclo”." : "Nenhum ciclo de avaliação foi aberto ainda."}
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
                    <span className="ml-auto text-micro text-fg-muted">{avaliacoes(c._count.evaluations)}</span>
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
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
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

function AbaDasCompetencias({
  competencias,
  podeEditar,
  podeApagar,
}: {
  competencias: { id: string; name: string; description: string | null; _count: { scores: number } }[];
  podeEditar: boolean;
  podeApagar: boolean;
}) {
  if (competencias.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ListChecks />}
          title="Nenhuma competência cadastrada"
          description={
            podeEditar
              ? "Cadastre em “Nova competência” o que se avalia nos ciclos. Sem nenhuma, não dá para avaliar."
              : "Quem gere as avaliações ainda não cadastrou as competências. Sem nenhuma, não dá para avaliar."
          }
        />
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border">
      <div
        className={`hidden sm:grid ${colunasDasCompetencias(podeEditar || podeApagar)} gap-x-4 px-4 py-3 text-micro font-semibold uppercase tracking-wide text-fg-muted`}
      >
        <span>Competência</span>
        <span>Descrição</span>
        <span>Uso</span>
        {(podeEditar || podeApagar) && <span className="sr-only">Ações</span>}
      </div>
      {competencias.map((c) => (
        <CompetenciaRow
          key={c.id}
          competencia={c}
          usos={c._count.scores}
          updateAction={podeEditar ? atualizarCompetencia : undefined}
          deleteAction={podeApagar && c._count.scores === 0 ? excluirCompetencia.bind(null, c.id) : undefined}
        />
      ))}
    </Card>
  );
}
