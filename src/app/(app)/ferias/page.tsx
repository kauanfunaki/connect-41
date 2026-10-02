import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, ArrowRight, CalendarClock, Palmtree } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { SITUACAO_DAS_FERIAS, COR_DAS_FERIAS, SeloDoDP } from "@/components/pessoas/rotulosDoDP";

const ACTIVE_STATUSES = ["PLANEJADA", "SOLICITADA", "EM_ANALISE", "APROVADA", "PROGRAMADA", "EM_GOZO"] as const;

export default async function FeriasPage() {
  const { ctx } = await abrirTelaDoModulo("dp_colaboradores");
  const prisma = getPrisma();

  const vacations = await prisma.vacation.findMany({
    where: { tenantId: ctx.tenantId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: { concessivePeriodEnd: "asc" },
    include: { person: { select: { id: true, name: true } } },
  });

  const now = new Date();
  const vencidas = vacations.filter((v) => v.concessivePeriodEnd && v.concessivePeriodEnd < now);
  const aVencer = vacations.filter((v) => !v.concessivePeriodEnd || v.concessivePeriodEnd >= now);

  // Eram duas seções empilhadas, "Vencidas (n)" e "A vencer / Programadas (n)"
  // (até 30/09). As contagens viraram cartões e as duas listas, uma tabela só
  // — vencidas primeiro, como antes — com a situação numa coluna com funil.
  const linhas = [
    ...vencidas.map((v) => ({ v, vencida: true })),
    ...aVencer.map((v) => ({ v, vencida: false })),
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Férias"
        subtitle={<>{vacations.length} registro{vacations.length !== 1 ? "s" : ""} em aberto</>}
      />

      <FaixaDeTotais
        itens={[
          {
            rotulo: "Vencidas",
            valor: String(vencidas.length),
            icone: <AlertTriangle />,
            tom: vencidas.length > 0 ? "text-danger" : undefined,
          },
          {
            rotulo: "A vencer / Programadas",
            valor: String(aVencer.length),
            icone: <CalendarClock />,
          },
        ]}
      />

      {linhas.length === 0 ? (
        <Card>
          <EmptyState icon={<Palmtree />} title="Nenhuma férias em aberto" description="Períodos de férias lançados na ficha de cada pessoa aparecem aqui até serem concluídos." />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {linhas.map(({ v, vencida }) => (
              <Link key={v.id} href={`/pessoas/${v.person.id}/ferias`} className="block">
                <Cartao className="hover:border-brand/40 transition-colors">
                  <TopoDoCartao nome={v.person.name} valor={`${v.days} dias`} />
                  {v.concessivePeriodEnd && (
                    <InfoDoCartao className={vencida ? "text-danger" : ""}>
                      concessivo até {formatCalendarDate(v.concessivePeriodEnd)}
                    </InfoDoCartao>
                  )}
                  <PeDoCartao>
                    {vencida && <SeloDoDP cor="bg-danger/10 text-danger border-danger/25">Vencida</SeloDoDP>}
                    <SeloDoDP cor={COR_DAS_FERIAS[v.status]}>{SITUACAO_DAS_FERIAS[v.status]}</SeloDoDP>
                  </PeDoCartao>
                </Cartao>
              </Link>
            ))}
          </CartoesNoCelular>

          <TabelaFiltravel
            linhas={linhas.map(({ v, vencida }) => ({
              id: v.id,
              valores: {
                colaborador: v.person.name,
                prazo: vencida ? "Vencida" : "A vencer",
                situacao: SITUACAO_DAS_FERIAS[v.status],
                concessivo: v.concessivePeriodEnd ? v.concessivePeriodEnd.toISOString().slice(0, 10) : "",
              },
            }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[800px] text-[length:var(--fs-ui)]">
                <thead>
                  <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Colaborador" chave="colaborador" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Prazo" chave="prazo" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Situação" chave="situacao" />
                    </th>
                    <th className="px-4 py-3">Dias</th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Concessivo até" chave="concessivo" tipo="data" align="right" />
                    </th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ v, vencida }) => (
                    <LinhaFiltravel key={v.id} id={v.id} className="border-b border-border">
                      <td className="px-4 py-3">
                        <Link href={`/pessoas/${v.person.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {v.person.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {vencida ? (
                          <SeloDoDP cor="bg-danger/10 text-danger border-danger/25">Vencida</SeloDoDP>
                        ) : (
                          <span className="text-fg-muted">A vencer</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <SeloDoDP cor={COR_DAS_FERIAS[v.status]}>{SITUACAO_DAS_FERIAS[v.status]}</SeloDoDP>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{v.days} dias</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${vencida ? "text-danger font-medium" : "text-fg-muted"}`}>
                        {v.concessivePeriodEnd ? formatCalendarDate(v.concessivePeriodEnd) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {/* Abre a aba de férias da ficha — é lá que se programa o gozo. */}
                        <Button href={`/pessoas/${v.person.id}/ferias`} variant="secondary" size="xs">
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
