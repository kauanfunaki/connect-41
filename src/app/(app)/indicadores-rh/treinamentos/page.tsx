import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext } from "@/lib/auth/context";
import { getRelatorioTreinamentos, type TreinamentoRow, type TreinamentoSituacao } from "@/lib/relatoriosRH";
import { formatCalendarDate } from "@/lib/format";
import { RelatorioHeader } from "@/components/relatorios/RelatorioHeader";
import { RelatorioTable, RelatorioBadge, ResumoChips, type BadgeTone } from "@/components/relatorios/RelatorioTable";

export const metadata = { title: "Relatório de Treinamentos" };

const SITUACAO: Record<TreinamentoSituacao, { label: string; tone: BadgeTone }> = {
  VENCIDO: { label: "Vencido", tone: "danger" },
  A_VENCER: { label: "A vencer", tone: "warning" },
  PENDENTE: { label: "Não realizado", tone: "neutral" },
  VALIDO: { label: "Válido", tone: "success" },
  SEM_VALIDADE: { label: "Sem validade", tone: "neutral" },
};

export default async function RelatorioTreinamentosPage() {
  const ctx = await getAuthContext();
  const rows = await getRelatorioTreinamentos(ctx);

  const count = (s: TreinamentoSituacao) => rows.filter((r) => r.situacao === s).length;

  return (
    <PageContainer>
      <RelatorioHeader
        breadcrumb="Treinamentos"
        title="Relatório de Treinamentos"
        subtitle="Validade calculada a partir da data da turma e da validade do treinamento — reciclagem vencida aparece no topo."
      />

      <ResumoChips
        items={[
          { label: "vencidos", count: count("VENCIDO"), tone: "danger" },
          { label: "a vencer (60 dias)", count: count("A_VENCER"), tone: "warning" },
          { label: "não realizados", count: count("PENDENTE"), tone: "neutral" },
          { label: "válidos", count: count("VALIDO"), tone: "success" },
        ]}
      />

      <RelatorioTable<TreinamentoRow>
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/pessoas/${r.personId}/treinamentos`}
        emptyTitle="Nenhuma participação em treinamento registrada."
        emptyDescription="Cadastre turmas e participantes no módulo de Treinamentos."
        columns={[
          { header: "Colaborador", render: (r) => r.personName },
          { header: "Treinamento", render: (r) => r.trainingName },
          { header: "Situação", render: (r) => <RelatorioBadge tone={SITUACAO[r.situacao].tone}>{SITUACAO[r.situacao].label}</RelatorioBadge> },
          { header: "Turma em", numeric: true, render: (r) => formatCalendarDate(r.classDate) },
          {
            header: "Válido até",
            numeric: true,
            render: (r) => (r.validadeAte ? formatCalendarDate(r.validadeAte) : "—"),
          },
          {
            header: "Dias",
            numeric: true,
            render: (r) =>
              r.diasParaVencer == null ? (
                "—"
              ) : r.diasParaVencer < 0 ? (
                <span className="text-danger font-medium">{Math.abs(r.diasParaVencer)} em atraso</span>
              ) : (
                `${r.diasParaVencer}`
              ),
          },
        ]}
      />
    </PageContainer>
  );
}
