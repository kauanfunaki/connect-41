import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Stethoscope } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { formatCalendarDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import {
  TIPO_DO_AFASTAMENTO,
  SITUACAO_DO_AFASTAMENTO,
  COR_DO_AFASTAMENTO,
  SeloDoDP,
} from "@/components/pessoas/rotulosDoDP";

/** Data-calendário em ISO (AAAA-MM-DD) para o funil — gravada à meia-noite UTC. */
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function AfastamentosPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();
  const canViewMedical = await canViewSensitiveField(ctx, "DADOS_MEDICOS");

  const absences = await prisma.absence.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["AFASTADO", "RETORNO_PREVISTO", "EM_ANALISE"] } },
    orderBy: { returnDate: "asc" },
    include: { person: { select: { id: true, name: true } } },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Afastamentos Ativos"
        subtitle={<>{absences.length} afastamento{absences.length !== 1 ? "s" : ""} em aberto</>}
      />

      {absences.length === 0 ? (
        <Card>
          <EmptyState icon={<Stethoscope />} title="Nenhum afastamento ativo" description="Afastamentos lançados na ficha de cada pessoa aparecem aqui enquanto estiverem ativos." />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {absences.map((a) => (
              <Link key={a.id} href={`/pessoas/${a.person.id}/afastamentos`} className="block">
                <Cartao className="hover:border-brand/40 transition-colors">
                  <TopoDoCartao nome={a.person.name} />
                  {canViewMedical && a.reason && <InfoDoCartao>{a.reason}</InfoDoCartao>}
                  <InfoDoCartao>
                    Desde {formatCalendarDate(a.startDate)}
                    {a.returnDate && ` · retorno previsto ${formatCalendarDate(a.returnDate)}`}
                  </InfoDoCartao>
                  <PeDoCartao>
                    <SeloDoDP cor={COR_DO_AFASTAMENTO[a.status]}>{SITUACAO_DO_AFASTAMENTO[a.status]}</SeloDoDP>
                    <span className="ml-auto text-[11.5px] text-fg-muted">{TIPO_DO_AFASTAMENTO[a.type]}</span>
                  </PeDoCartao>
                </Cartao>
              </Link>
            ))}
          </CartoesNoCelular>

          {/* Era uma lista de linhas-link (até 30/09); virou tabela com funil.
              O motivo é dado médico: sem a permissão, a coluna nem aparece. */}
          <TabelaFiltravel
            linhas={absences.map((a) => ({
              id: a.id,
              valores: {
                colaborador: a.person.name,
                tipo: TIPO_DO_AFASTAMENTO[a.type],
                situacao: SITUACAO_DO_AFASTAMENTO[a.status],
                desde: iso(a.startDate),
                retorno: a.returnDate ? iso(a.returnDate) : "",
              },
            }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[860px] text-[length:var(--fs-ui)]">
                <thead>
                  <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Colaborador" chave="colaborador" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Tipo" chave="tipo" />
                    </th>
                    {canViewMedical && <th className="px-4 py-3">Motivo</th>}
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Situação" chave="situacao" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Desde" chave="desde" tipo="data" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Retorno previsto" chave="retorno" tipo="data" align="right" />
                    </th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {absences.map((a) => (
                    <LinhaFiltravel key={a.id} id={a.id} className="border-b border-border">
                      <td className="px-4 py-3">
                        <Link href={`/pessoas/${a.person.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {a.person.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{TIPO_DO_AFASTAMENTO[a.type]}</td>
                      {canViewMedical && (
                        <td className="px-4 py-3 text-fg-muted">
                          <span className="block max-w-[240px] truncate" title={a.reason ?? undefined}>
                            {a.reason ?? "—"}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <SeloDoDP cor={COR_DO_AFASTAMENTO[a.status]}>{SITUACAO_DO_AFASTAMENTO[a.status]}</SeloDoDP>
                      </td>
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{formatCalendarDate(a.startDate)}</td>
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">
                        {a.returnDate ? formatCalendarDate(a.returnDate) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {/* Abre a aba de afastamentos da ficha — é lá que a situação muda. */}
                        <Button href={`/pessoas/${a.person.id}/afastamentos`} variant="secondary" size="xs">
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
