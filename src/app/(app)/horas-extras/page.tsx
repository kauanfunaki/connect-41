import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Clock } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { TIPO_DO_DIA, horasDoDP } from "@/components/pessoas/rotulosDoDP";

export default async function HorasExtrasPage() {
  const { ctx } = await abrirTelaDoModulo("dp_horas_extras");
  const prisma = getPrisma();

  const entries = await prisma.overtimeEntry.findMany({
    where: { tenantId: ctx.tenantId, status: "PENDENTE_APROVACAO" },
    orderBy: { date: "asc" },
    include: { person: { select: { id: true, name: true } } },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Horas Extras Pendentes"
        subtitle={<>{entries.length} lançamento{entries.length !== 1 ? "s" : ""} aguardando aprovação</>}
      />

      {entries.length === 0 ? (
        <Card>
          <EmptyState icon={<Clock />} title="Nenhum lançamento pendente" description="Lançamentos de horas extras aguardando aprovação aparecem aqui." />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {entries.map((o) => (
              <Link key={o.id} href={`/pessoas/${o.person.id}/horas-extras`} className="block">
                <Cartao className="hover:border-brand/40 transition-colors">
                  <TopoDoCartao nome={o.person.name} valor={o.overtimeHours ? horasDoDP(o.overtimeHours) : undefined} />
                  <InfoDoCartao>
                    {formatCalendarDate(o.date)} · {TIPO_DO_DIA[o.dayType]}
                  </InfoDoCartao>
                </Cartao>
              </Link>
            ))}
          </CartoesNoCelular>

          {/* Era uma lista de linhas-link (até 30/09); virou tabela com funil.
              Todas aqui aguardam aprovação, então a situação não vira coluna. */}
          <TabelaFiltravel
            linhas={entries.map((o) => ({
              id: o.id,
              valores: {
                colaborador: o.person.name,
                data: o.date.toISOString().slice(0, 10),
                dia: TIPO_DO_DIA[o.dayType],
              },
            }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[720px] text-[length:var(--fs-ui)]">
                <thead>
                  <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Colaborador" chave="colaborador" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Data" chave="data" tipo="data" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Tipo do dia" chave="dia" align="right" />
                    </th>
                    <th className="px-4 py-3">Horas extras</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((o) => (
                    <LinhaFiltravel key={o.id} id={o.id} className="border-b border-border">
                      <td className="px-4 py-3">
                        <Link href={`/pessoas/${o.person.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {o.person.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{formatCalendarDate(o.date)}</td>
                      <td className="px-4 py-3 text-fg-secondary">{TIPO_DO_DIA[o.dayType]}</td>
                      <td className="px-4 py-3 text-fg-secondary">{o.overtimeHours ? horasDoDP(o.overtimeHours) : "—"}</td>
                      <td className="px-4 py-3">
                        {/* Abre a aba de horas extras da ficha — é lá que se aprova. */}
                        <Button href={`/pessoas/${o.person.id}/horas-extras`} variant="secondary" size="xs">
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
