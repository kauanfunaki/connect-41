import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ArrowRight, CalendarClock } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { SITUACAO_DA_ESCALA, COR_DA_ESCALA, SeloDoDP } from "@/components/pessoas/rotulosDoDP";

export default async function EscalasPage() {
  const { ctx } = await abrirTelaDoModulo("dp_escalas");
  const prisma = getPrisma();

  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  const entries = await prisma.scheduleEntry.findMany({
    where: {
      tenantId: ctx.tenantId,
      date: { gte: now, lte: in30Days },
      status: { notIn: ["CANCELADA"] },
    },
    orderBy: { date: "asc" },
    include: { person: { select: { id: true, name: true } }, shift: { select: { name: true } } },
  });

  const turnoDe = (e: (typeof entries)[number]) => (e.dayOff ? "Folga" : (e.shift?.name ?? "Sem turno definido"));

  return (
    <PageContainer>
      <PageHeader
        title="Escala — Próximos 30 dias"
        subtitle={<>{entries.length} lançamento{entries.length !== 1 ? "s" : ""} de escala</>}
      />

      {entries.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarClock />} title="Nenhuma escala montada" description="Escalas montadas na ficha de cada pessoa para os próximos 30 dias aparecem aqui." />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {entries.map((e) => (
              <Link key={e.id} href={`/pessoas/${e.person.id}/escala`} className="block">
                <Cartao className="hover:border-brand/40 transition-colors">
                  <TopoDoCartao nome={e.person.name} valor={formatCalendarDate(e.date)} />
                  <InfoDoCartao>
                    {turnoDe(e)}
                    {e.isHoliday && " · Feriado"}
                  </InfoDoCartao>
                  <PeDoCartao>
                    <SeloDoDP cor={COR_DA_ESCALA[e.status]}>{SITUACAO_DA_ESCALA[e.status]}</SeloDoDP>
                  </PeDoCartao>
                </Cartao>
              </Link>
            ))}
          </CartoesNoCelular>

          {/* Eram listas de linhas-link agrupadas por dia (até 30/09); virou uma
              tabela só, na ordem do dia, com o funil da data fazendo o papel
              do agrupamento — e os de turno e pessoa, que o agrupamento não dava. */}
          <TabelaFiltravel
            linhas={entries.map((e) => ({
              id: e.id,
              valores: {
                data: e.date.toISOString().slice(0, 10),
                colaborador: e.person.name,
                turno: turnoDe(e),
                situacao: SITUACAO_DA_ESCALA[e.status],
              },
            }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Data" chave="data" tipo="data" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Colaborador" chave="colaborador" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Turno" chave="turno" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                    </th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <LinhaFiltravel key={e.id} id={e.id} className="border-b border-border">
                      <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">{formatCalendarDate(e.date)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/pessoas/${e.person.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {e.person.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">
                        {turnoDe(e)}
                        {e.isHoliday && <span className="text-fg-muted"> · Feriado</span>}
                      </td>
                      <td className="px-4 py-3">
                        <SeloDoDP cor={COR_DA_ESCALA[e.status]}>{SITUACAO_DA_ESCALA[e.status]}</SeloDoDP>
                      </td>
                      <td className="px-4 py-3">
                        <Button href={`/pessoas/${e.person.id}/escala`} variant="secondary" size="xs">
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
