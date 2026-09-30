import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarClock } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddObrigacaoForm } from "@/components/admin/AddObrigacaoForm";
import { AcoesDoItem } from "@/components/admin/AcoesDoItem";
import { ToggleObrigacaoButton } from "@/components/admin/ToggleObrigacaoButton";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { criarObrigacao, alternarObrigacao, excluirObrigacao } from "./actions";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "segunda-feira",
  2: "terça-feira",
  3: "quarta-feira",
  4: "quinta-feira",
  5: "sexta-feira",
  6: "sábado",
  7: "domingo",
};

/** O nome da frequência, sem o dia — é o que o funil da coluna oferece. */
const FREQUENCY_NAME: Record<string, string> = {
  DAILY: "Diária",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
};

function excluirDaObrigacao(o: { id: string; title: string }) {
  return {
    action: excluirObrigacao.bind(null, o.id),
    titulo: `Excluir a obrigação "${o.title}"?`,
    descricao: "Nenhum item novo será gerado. Os itens de kanban já criados ficam.",
  };
}

function frequencyLabel(o: { frequency: string; dayOfMonth: number | null; dayOfWeek: number | null }): string {
  switch (o.frequency) {
    case "DAILY":
      return "diária";
    case "WEEKLY":
      return o.dayOfWeek ? `semanal · ${WEEKDAY_LABELS[o.dayOfWeek]}` : "semanal";
    case "BIWEEKLY":
      return o.dayOfWeek ? `quinzenal · ${WEEKDAY_LABELS[o.dayOfWeek]}` : "quinzenal";
    default:
      return o.dayOfMonth ? `mensal · dia ${o.dayOfMonth}` : "mensal";
  }
}

export default async function ObrigacoesPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const { labels } = await getSectorMaps(ctx.tenantId);

  const [obligations, companies, pipelines, users] = await Promise.all([
    prisma.recurringObligation.findMany({
      where: { tenantId: ctx.tenantId },
      include: { company: { select: { name: true } }, responsible: { select: { name: true } }, pipeline: { select: { name: true } } },
      orderBy: [{ active: "desc" }, { frequency: "asc" }, { title: "asc" }],
    }),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { not: "CHURNED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.pipeline.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      select: { id: true, name: true, sectorCode: true },
      orderBy: [{ sectorCode: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Obrigações Recorrentes"
        subtitle="DAS, DCTF, folha, título bancário diário, contas a receber semanais e afins — o Connect
          gera automaticamente o item de kanban na frequência escolhida (diária, semanal, quinzenal
          ou mensal), com vencimento prorrogado para o próximo dia útil."
      />

      <AddObrigacaoForm
        action={criarObrigacao}
        companies={companies}
        pipelines={pipelines.map((p) => ({ ...p, sectorLabel: sectorLabel(labels, p.sectorCode) }))}
        users={users}
      />

      {obligations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock />}
            title="Nenhuma obrigação recorrente cadastrada"
            description="Use o formulário acima para cadastrar obrigações como DAS, DCTF e folha — o Connect gera o item de kanban todo mês automaticamente."
          />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {obligations.map((o) => (
              <Cartao key={o.id}>
                <TopoDoCartao nome={o.title} />
                <InfoDoCartao>
                  {o.company.name} · {sectorLabel(labels, o.sectorCode)} · kanban {o.pipeline.name}
                </InfoDoCartao>
                <InfoDoCartao>
                  {frequencyLabel(o)} · {o.responsible ? o.responsible.name : "notifica o setor"}
                </InfoDoCartao>
                <PeDoCartao>
                  <ToggleObrigacaoButton action={alternarObrigacao.bind(null, o.id)} ativo={o.active} nome={o.title} />
                  <AcoesDoItem className="ml-auto" excluir={excluirDaObrigacao(o)} />
                </PeDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>

          {/* Era uma lista com tudo numa linha cinza ("empresa · setor · kanban ·
              frequência · responsável"). Virou tabela no casco padrão, com funil
              nas colunas que se repetem (polimento de 30/09): com dezenas de
              obrigações, achar "as mensais da Fulana" era ler a lista inteira. */}
          <TabelaFiltravel
            linhas={obligations.map((o) => ({
              id: o.id,
              valores: {
                empresa: o.company.name,
                setor: sectorLabel(labels, o.sectorCode),
                kanban: o.pipeline.name,
                frequencia: FREQUENCY_NAME[o.frequency] ?? "Mensal",
                responsavel: o.responsible?.name ?? "Notifica o setor",
                situacao: o.active ? "Ativa" : "Inativa",
              },
            }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[1000px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">Obrigação</th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna
                        rotulo="Setor"
                        campos={[
                          { chave: "setor", rotulo: "Setor" },
                          { chave: "kanban", rotulo: "Kanban" },
                        ]}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Frequência" chave="frequencia" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Responsável" chave="responsavel" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                    </th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map((o) => (
                    <LinhaFiltravel key={o.id} id={o.id} className="border-b border-border">
                      <td className="px-4 py-3">
                        <span className="block max-w-[260px] font-medium text-fg truncate" title={o.title}>
                          {o.title}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block max-w-[220px] text-fg-secondary truncate" title={o.company.name}>
                          {o.company.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-fg-secondary">{sectorLabel(labels, o.sectorCode)}</span>
                        <span className="block text-[11px] text-fg-muted">kanban {o.pipeline.name}</span>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">{frequencyLabel(o)}</td>
                      <td className="px-4 py-3 text-fg-secondary">
                        {o.responsible ? o.responsible.name : <span className="text-fg-muted">notifica o setor</span>}
                      </td>
                      <td className="px-4 py-3">
                        <ToggleObrigacaoButton action={alternarObrigacao.bind(null, o.id)} ativo={o.active} nome={o.title} />
                      </td>
                      <td className="px-4 py-3">
                        <AcoesDoItem excluir={excluirDaObrigacao(o)} />
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
