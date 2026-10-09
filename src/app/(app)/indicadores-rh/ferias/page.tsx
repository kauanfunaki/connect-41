import { PageContainer } from "@/components/shared/PageContainer";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { getRelatorioFerias, type FeriasRow, type FeriasSituacao } from "@/lib/relatoriosRH";
import { formatCalendarDate, formatarNumero } from "@/lib/format";
import { RelatorioHeader } from "@/components/relatorios/RelatorioHeader";
import { RelatorioTable, RelatorioBadge, TOM_DO_TOTAL, type BadgeTone } from "@/components/relatorios/RelatorioTable";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { AlertTriangle, Clock, CalendarCheck, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Relatório de férias" };

const SITUACAO: Record<FeriasSituacao, { label: string; tone: BadgeTone }> = {
  VENCIDA: { label: "Vencida", tone: "danger" },
  A_VENCER: { label: "A vencer", tone: "warning" },
  PROGRAMADA: { label: "Programada", tone: "brand" },
  EM_DIA: { label: "Em dia", tone: "neutral" },
};

export default async function RelatorioFeriasPage() {
  const { ctx } = await abrirTelaDoModulo("gestao_indicadores_rh");
  const rows = await getRelatorioFerias(ctx);

  const count = (s: FeriasSituacao) => rows.filter((r) => r.situacao === s).length;

  return (
    <PageContainer>
      <RelatorioHeader
        breadcrumb="Férias"
        title="Relatório de férias"
        subtitle="Períodos aquisitivos em aberto, por urgência. Vencida é passivo consumado; a vencer ainda dá pra programar."
      />

      {/* As contagens eram selos soltos numa linha (até 30/09); viraram os
          cartões de total. O recorte fino fica no funil da coluna Situação. */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Vencidas", n: count("VENCIDA"), tone: "danger" as const, icone: <AlertTriangle /> },
          { rotulo: "A vencer (60 dias)", n: count("A_VENCER"), tone: "warning" as const, icone: <Clock /> },
          { rotulo: "Programadas", n: count("PROGRAMADA"), tone: "brand" as const, icone: <CalendarCheck /> },
          { rotulo: "Em dia", n: count("EM_DIA"), tone: "neutral" as const, icone: <CheckCircle2 /> },
        ].map((i) => ({ rotulo: i.rotulo, valor: formatarNumero(i.n, 0), icone: i.icone, tom: i.n > 0 ? TOM_DO_TOTAL[i.tone] : undefined }))}
      />

      <RelatorioTable<FeriasRow>
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/pessoas/${r.personId}/ferias`}
        emptyTitle="Nenhum período de férias em aberto."
        emptyDescription="Todos os períodos estão concluídos ou cancelados."
        columns={[
          { header: "Colaborador", render: (r) => r.personName, filtro: { chave: "colaborador", valor: (r) => r.personName } },
          { header: "Empresa", render: (r) => r.companyName ?? "—", filtro: { chave: "empresa", valor: (r) => r.companyName ?? "" } },
          {
            header: "Situação",
            render: (r) => <RelatorioBadge tone={SITUACAO[r.situacao].tone}>{SITUACAO[r.situacao].label}</RelatorioBadge>,
            filtro: { chave: "situacao", valor: (r) => SITUACAO[r.situacao].label },
          },
          { header: "Período aquisitivo", render: (r) => r.acquisitiveLabel },
          {
            header: "Limite p/ gozo",
            numeric: true,
            render: (r) => (r.concessiveEnd ? formatCalendarDate(r.concessiveEnd) : "—"),
            filtro: { chave: "limite", valor: (r) => (r.concessiveEnd ? r.concessiveEnd.toISOString().slice(0, 10) : ""), tipo: "data" },
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
