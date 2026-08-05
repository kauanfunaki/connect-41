import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext } from "@/lib/auth/context";
import { getRelatorioFerias, type FeriasRow, type FeriasSituacao } from "@/lib/relatoriosRH";
import { formatCalendarDate } from "@/lib/format";
import { RelatorioHeader } from "@/components/relatorios/RelatorioHeader";
import { RelatorioTable, RelatorioBadge, ResumoChips, type BadgeTone } from "@/components/relatorios/RelatorioTable";

export const metadata = { title: "Relatório de Férias" };

const SITUACAO: Record<FeriasSituacao, { label: string; tone: BadgeTone }> = {
  VENCIDA: { label: "Vencida", tone: "danger" },
  A_VENCER: { label: "A vencer", tone: "warning" },
  PROGRAMADA: { label: "Programada", tone: "brand" },
  EM_DIA: { label: "Em dia", tone: "neutral" },
};

export default async function RelatorioFeriasPage() {
  const ctx = await getAuthContext();
  const rows = await getRelatorioFerias(ctx);

  const count = (s: FeriasSituacao) => rows.filter((r) => r.situacao === s).length;

  return (
    <PageContainer>
      <RelatorioHeader
        breadcrumb="Férias"
        title="Relatório de Férias"
        subtitle="Períodos aquisitivos em aberto, por urgência. Vencida é passivo consumado; a vencer ainda dá pra programar."
      />

      <ResumoChips
        items={[
          { label: "vencidas", count: count("VENCIDA"), tone: "danger" },
          { label: "a vencer (60 dias)", count: count("A_VENCER"), tone: "warning" },
          { label: "programadas", count: count("PROGRAMADA"), tone: "brand" },
          { label: "em dia", count: count("EM_DIA"), tone: "neutral" },
        ]}
      />

      <RelatorioTable<FeriasRow>
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/pessoas/${r.personId}/ferias`}
        emptyTitle="Nenhum período de férias em aberto."
        emptyDescription="Todos os períodos estão concluídos ou cancelados."
        columns={[
          { header: "Colaborador", render: (r) => r.personName },
          { header: "Empresa", render: (r) => r.companyName ?? "—" },
          { header: "Situação", render: (r) => <RelatorioBadge tone={SITUACAO[r.situacao].tone}>{SITUACAO[r.situacao].label}</RelatorioBadge> },
          { header: "Período aquisitivo", render: (r) => r.acquisitiveLabel },
          {
            header: "Limite p/ gozo",
            numeric: true,
            render: (r) => (r.concessiveEnd ? formatCalendarDate(r.concessiveEnd) : "—"),
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
          {
            header: "Início marcado",
            numeric: true,
            render: (r) => (r.startDate ? formatCalendarDate(r.startDate) : "—"),
          },
        ]}
      />
    </PageContainer>
  );
}
