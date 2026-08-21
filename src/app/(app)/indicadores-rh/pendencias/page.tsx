import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext } from "@/lib/auth/context";
import { getRelatorioPendencias, type PendenciaRow } from "@/lib/relatoriosRH";
import { formatCalendarDate } from "@/lib/format";
import { RelatorioHeader } from "@/components/relatorios/RelatorioHeader";
import { RelatorioTable, RelatorioBadge, ResumoChips, type BadgeTone } from "@/components/relatorios/RelatorioTable";

export const metadata = { title: "Pendências documentais e operacionais" };

const TIPO: Record<PendenciaRow["tipo"], { label: string; tone: BadgeTone }> = {
  DOCUMENTO_VENCIDO: { label: "Documento vencido", tone: "danger" },
  EXAME_PENDENTE: { label: "Exame sem ASO", tone: "warning" },
  ADMISSAO_INCOMPLETA: { label: "Admissão incompleta", tone: "warning" },
  DOCUMENTO_VENCENDO: { label: "Documento vencendo", tone: "neutral" },
};

export default async function RelatorioPendenciasPage() {
  const ctx = await getAuthContext();
  const rows = await getRelatorioPendencias(ctx);

  const count = (t: PendenciaRow["tipo"]) => rows.filter((r) => r.tipo === t).length;

  return (
    <PageContainer>
      <RelatorioHeader
        breadcrumb="Pendências"
        title="Pendências documentais e operacionais"
        subtitle="Consolida numa lista só o que hoje aparecia espalhado por ficha: documento com vencimento, admissão em aberto e exame sem ASO conferido."
      />

      <ResumoChips
        items={[
          { label: "documentos vencidos", count: count("DOCUMENTO_VENCIDO"), tone: "danger" },
          { label: "exames sem ASO", count: count("EXAME_PENDENTE"), tone: "warning" },
          { label: "admissões incompletas", count: count("ADMISSAO_INCOMPLETA"), tone: "warning" },
          { label: "vencendo em 30 dias", count: count("DOCUMENTO_VENCENDO"), tone: "neutral" },
        ]}
      />

      <RelatorioTable<PendenciaRow>
        rows={rows}
        rowKey={(r) => r.key}
        rowHref={(r) => `/pessoas/${r.personId}`}
        emptyTitle="Nenhuma pendência em aberto."
        emptyDescription="Documentos, admissões e exames estão todos em dia."
        columns={[
          { header: "Colaborador", render: (r) => r.personName },
          { header: "Pendência", render: (r) => <RelatorioBadge tone={TIPO[r.tipo].tone}>{TIPO[r.tipo].label}</RelatorioBadge> },
          { header: "Detalhe", render: (r) => r.descricao },
          {
            header: "Referência",
            numeric: true,
            render: (r) => (r.referencia ? formatCalendarDate(r.referencia) : "—"),
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
