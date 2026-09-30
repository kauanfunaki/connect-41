import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext } from "@/lib/auth/context";
import { getRelatorioTreinamentos, type TreinamentoRow, type TreinamentoSituacao } from "@/lib/relatoriosRH";
import { formatCalendarDate } from "@/lib/format";
import { RelatorioHeader } from "@/components/relatorios/RelatorioHeader";
import { RelatorioTable, RelatorioBadge, TOM_DO_TOTAL, type BadgeTone } from "@/components/relatorios/RelatorioTable";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { AlertTriangle, Clock, CircleDashed, CheckCircle2 } from "lucide-react";

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

      {/* As contagens eram selos soltos numa linha (até 30/09); viraram os
          cartões de total. O recorte fino fica no funil da coluna Situação. */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Vencidos", n: count("VENCIDO"), tone: "danger" as const, icone: <AlertTriangle /> },
          { rotulo: "A vencer (60 dias)", n: count("A_VENCER"), tone: "warning" as const, icone: <Clock /> },
          { rotulo: "Não realizados", n: count("PENDENTE"), tone: "neutral" as const, icone: <CircleDashed /> },
          { rotulo: "Válidos", n: count("VALIDO"), tone: "success" as const, icone: <CheckCircle2 /> },
        ].map((i) => ({ rotulo: i.rotulo, valor: String(i.n), icone: i.icone, tom: i.n > 0 ? TOM_DO_TOTAL[i.tone] : undefined }))}
      />

      <RelatorioTable<TreinamentoRow>
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/pessoas/${r.personId}/treinamentos`}
        emptyTitle="Nenhuma participação em treinamento registrada."
        emptyDescription="Cadastre turmas e participantes no módulo de Treinamentos."
        columns={[
          { header: "Colaborador", render: (r) => r.personName, filtro: { chave: "colaborador", valor: (r) => r.personName } },
          { header: "Treinamento", render: (r) => r.trainingName, filtro: { chave: "treinamento", valor: (r) => r.trainingName } },
          {
            header: "Situação",
            render: (r) => <RelatorioBadge tone={SITUACAO[r.situacao].tone}>{SITUACAO[r.situacao].label}</RelatorioBadge>,
            filtro: { chave: "situacao", valor: (r) => SITUACAO[r.situacao].label },
          },
          {
            header: "Turma em",
            numeric: true,
            render: (r) => formatCalendarDate(r.classDate),
            filtro: { chave: "turma", valor: (r) => r.classDate.toISOString().slice(0, 10), tipo: "data" },
          },
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
