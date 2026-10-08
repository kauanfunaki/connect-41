import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ArrowRight, UserMinus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { saoPauloParts } from "@/lib/agenda";
import { PageContainer } from "@/components/shared/PageContainer";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import {
  TIPO_DO_DESLIGAMENTO,
  SITUACAO_DO_DESLIGAMENTO,
  COR_DO_DESLIGAMENTO,
  SeloDoDP,
} from "@/components/pessoas/rotulosDoDP";

export default async function DesligamentosPage() {
  const { ctx } = await abrirTelaDoModulo("dp_colaboradores");
  const prisma = getPrisma();

  const terminations = await prisma.termination.findMany({
    where: { tenantId: ctx.tenantId, status: { notIn: ["FINALIZADO", "CANCELADO"] } },
    orderBy: { requestedAt: "asc" },
    include: { person: { select: { id: true, name: true } } },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Desligamentos em Andamento"
        subtitle={<>{terminations.length} desligamento{terminations.length !== 1 ? "s" : ""} em processo</>}
      />

      {terminations.length === 0 ? (
        <Card>
          <EmptyState icon={<UserMinus />} title="Nenhum desligamento em andamento" description="Desligamentos iniciados na ficha de cada pessoa aparecem aqui enquanto estiverem em andamento." />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {terminations.map((t) => (
              <Link key={t.id} href={`/pessoas/${t.person.id}/desligamento`} className="block">
                <Cartao className="hover:border-brand/40 transition-colors">
                  <TopoDoCartao nome={t.person.name} />
                  <InfoDoCartao>
                    {TIPO_DO_DESLIGAMENTO[t.type]} · solicitado em {formatInstantDate(t.requestedAt)}
                  </InfoDoCartao>
                  <PeDoCartao>
                    <SeloDoDP cor={COR_DO_DESLIGAMENTO[t.status]}>{SITUACAO_DO_DESLIGAMENTO[t.status]}</SeloDoDP>
                  </PeDoCartao>
                </Cartao>
              </Link>
            ))}
          </CartoesNoCelular>

          {/* Era uma lista de linhas-link (até 30/09); virou tabela com funil.
              Sem funil no nome: cada pessoa tem um desligamento só em aberto. */}
          <TabelaFiltravel
            linhas={terminations.map((t) => ({
              id: t.id,
              valores: {
                tipo: TIPO_DO_DESLIGAMENTO[t.type],
                situacao: SITUACAO_DO_DESLIGAMENTO[t.status],
                solicitado: saoPauloParts(t.requestedAt).dateKey,
              },
            }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">Colaborador</th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Tipo" chave="tipo" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Situação" chave="situacao" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Solicitado em" chave="solicitado" tipo="data" align="right" />
                    </th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {terminations.map((t) => (
                    <LinhaFiltravel key={t.id} id={t.id} className="border-b border-border">
                      <td className="px-4 py-3">
                        <Link href={`/pessoas/${t.person.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {t.person.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{TIPO_DO_DESLIGAMENTO[t.type]}</td>
                      <td className="px-4 py-3">
                        <SeloDoDP cor={COR_DO_DESLIGAMENTO[t.status]}>{SITUACAO_DO_DESLIGAMENTO[t.status]}</SeloDoDP>
                      </td>
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{formatInstantDate(t.requestedAt)}</td>
                      <td className="px-4 py-3">
                        {/* Abre a aba de desligamento — conferência do TRCT e situação. */}
                        <Button href={`/pessoas/${t.person.id}/desligamento`} variant="secondary" size="xs">
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
