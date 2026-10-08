import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { getRelatorioDistorcoes, type DistorcaoRow } from "@/lib/relatoriosRH";
import { RelatorioHeader } from "@/components/relatorios/RelatorioHeader";
import { RelatorioTable, RelatorioBadge } from "@/components/relatorios/RelatorioTable";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatarNumero, formatarReais } from "@/lib/format";

export const metadata = { title: "Distorções salariais" };


export default async function RelatorioDistorcoesPage() {
  const { ctx } = await abrirTelaDoModulo("gestao_indicadores_rh");
  const { permitido, rows } = await getRelatorioDistorcoes(ctx);

  // O relatório inteiro É sobre salário — sem a permissão sensível não há o que
  // exibir, então some da navegação em vez de abrir vazio.
  if (!permitido) notFound();

  const abaixo = rows.filter((r) => r.tipo === "ABAIXO_FAIXA").length;
  const acima = rows.filter((r) => r.tipo === "ACIMA_FAIXA").length;

  return (
    <PageContainer>
      <RelatorioHeader
        breadcrumb="Distorções salariais"
        title="Distorções salariais"
        subtitle="Compara o salário atual com a faixa cadastrada no cargo. Só aparece quem está fora da faixa — quem está dentro não é distorção."
      />

      {/* As contagens eram selos soltos numa linha (até 30/09); viraram os
          cartões de total. O recorte fino fica no funil da coluna Situação. */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Abaixo da faixa", valor: formatarNumero(abaixo, 0), icone: <TrendingDown />, tom: abaixo > 0 ? "text-warning-fg" : undefined },
          { rotulo: "Acima da faixa", valor: formatarNumero(acima, 0), icone: <TrendingUp />, tom: acima > 0 ? "text-brand" : undefined },
        ]}
      />

      <RelatorioTable<DistorcaoRow>
        rows={rows}
        rowKey={(r) => r.personId}
        rowHref={(r) => `/pessoas/${r.personId}/salario`}
        emptyTitle="Nenhuma distorção encontrada."
        emptyDescription="Todos os colaboradores com cargo e faixa cadastrados estão dentro do intervalo. Cargos sem faixa definida não entram nesta análise."
        minWidth="820px"
        columns={[
          { header: "Colaborador", render: (r) => r.personName },
          { header: "Cargo", render: (r) => r.cargoName ?? "—", filtro: { chave: "cargo", valor: (r) => r.cargoName ?? "" } },
          { header: "Empresa", render: (r) => r.companyName ?? "—", filtro: { chave: "empresa", valor: (r) => r.companyName ?? "" } },
          {
            header: "Situação",
            filtro: { chave: "situacao", valor: (r) => (r.tipo === "ABAIXO_FAIXA" ? "Abaixo da faixa" : "Acima da faixa") },
            render: (r) => (
              <RelatorioBadge tone={r.tipo === "ABAIXO_FAIXA" ? "warning" : "brand"}>
                {r.tipo === "ABAIXO_FAIXA" ? "Abaixo da faixa" : "Acima da faixa"}
              </RelatorioBadge>
            ),
          },
          { header: "Salário", numeric: true, render: (r) => formatarReais(r.salary) },
          { header: "Faixa do cargo", numeric: true, render: (r) => `${formatarReais(r.rangeMin)} – ${formatarReais(r.rangeMax)}` },
          {
            header: "Desvio",
            numeric: true,
            render: (r) => (
              <span className={r.tipo === "ABAIXO_FAIXA" ? "text-warning-fg font-medium" : "text-brand font-medium"}>
                {r.desvioPct != null ? `${r.desvioPct > 0 ? "+" : ""}${r.desvioPct}%` : "—"}
              </span>
            ),
          },
        ]}
      />
    </PageContainer>
  );
}
