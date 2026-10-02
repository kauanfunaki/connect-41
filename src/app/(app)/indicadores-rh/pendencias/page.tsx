import { PageContainer } from "@/components/shared/PageContainer";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { getRelatorioPendencias, type PendenciaRow } from "@/lib/relatoriosRH";
import { formatCalendarDate } from "@/lib/format";
import { RelatorioHeader } from "@/components/relatorios/RelatorioHeader";
import { RelatorioTable, RelatorioBadge, TOM_DO_TOTAL, type BadgeTone } from "@/components/relatorios/RelatorioTable";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { FileWarning, Stethoscope, UserPlus, CalendarClock } from "lucide-react";

export const metadata = { title: "Pendências documentais e operacionais" };

const TIPO: Record<PendenciaRow["tipo"], { label: string; tone: BadgeTone }> = {
  DOCUMENTO_VENCIDO: { label: "Documento vencido", tone: "danger" },
  EXAME_PENDENTE: { label: "Exame sem ASO", tone: "warning" },
  ADMISSAO_INCOMPLETA: { label: "Admissão incompleta", tone: "warning" },
  DOCUMENTO_VENCENDO: { label: "Documento vencendo", tone: "neutral" },
};

export default async function RelatorioPendenciasPage() {
  const { ctx } = await abrirTelaDoModulo("gestao_indicadores_rh");
  const rows = await getRelatorioPendencias(ctx);

  const count = (t: PendenciaRow["tipo"]) => rows.filter((r) => r.tipo === t).length;

  return (
    <PageContainer>
      <RelatorioHeader
        breadcrumb="Pendências"
        title="Pendências documentais e operacionais"
        subtitle="Consolida numa lista só o que hoje aparecia espalhado por ficha: documento com vencimento, admissão em aberto e exame sem ASO conferido."
      />

      {/* As contagens eram selos soltos numa linha (até 30/09); viraram os
          cartões de total. O recorte fino fica no funil da coluna Pendência. */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Documentos vencidos", n: count("DOCUMENTO_VENCIDO"), tone: "danger" as const, icone: <FileWarning /> },
          { rotulo: "Exames sem ASO", n: count("EXAME_PENDENTE"), tone: "warning" as const, icone: <Stethoscope /> },
          { rotulo: "Admissões incompletas", n: count("ADMISSAO_INCOMPLETA"), tone: "warning" as const, icone: <UserPlus /> },
          { rotulo: "Vencendo em 30 dias", n: count("DOCUMENTO_VENCENDO"), tone: "neutral" as const, icone: <CalendarClock /> },
        ].map((i) => ({ rotulo: i.rotulo, valor: String(i.n), icone: i.icone, tom: i.n > 0 ? TOM_DO_TOTAL[i.tone] : undefined }))}
      />

      <RelatorioTable<PendenciaRow>
        rows={rows}
        rowKey={(r) => r.key}
        rowHref={(r) => `/pessoas/${r.personId}`}
        emptyTitle="Nenhuma pendência em aberto."
        emptyDescription="Documentos, admissões e exames estão todos em dia."
        columns={[
          { header: "Colaborador", render: (r) => r.personName, filtro: { chave: "colaborador", valor: (r) => r.personName } },
          {
            header: "Pendência",
            render: (r) => <RelatorioBadge tone={TIPO[r.tipo].tone}>{TIPO[r.tipo].label}</RelatorioBadge>,
            filtro: { chave: "pendencia", valor: (r) => TIPO[r.tipo].label },
          },
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
