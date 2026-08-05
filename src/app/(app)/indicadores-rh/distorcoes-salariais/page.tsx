import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext } from "@/lib/auth/context";
import { getRelatorioDistorcoes, type DistorcaoRow } from "@/lib/relatoriosRH";
import { RelatorioHeader } from "@/components/relatorios/RelatorioHeader";
import { RelatorioTable, RelatorioBadge, ResumoChips } from "@/components/relatorios/RelatorioTable";

export const metadata = { title: "Distorções salariais" };

// Mesmo formato do fmtCurrency de indicadoresRH.ts — o Number() explícito é o
// que a regra de lint usa pra distinguir moeda de data formatada na mão.
function brl(v: number | null): string {
  return v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default async function RelatorioDistorcoesPage() {
  const ctx = await getAuthContext();
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

      <ResumoChips
        items={[
          { label: "abaixo da faixa", count: abaixo, tone: "warning" },
          { label: "acima da faixa", count: acima, tone: "brand" },
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
          { header: "Cargo", render: (r) => r.cargoName ?? "—" },
          { header: "Empresa", render: (r) => r.companyName ?? "—" },
          {
            header: "Situação",
            render: (r) => (
              <RelatorioBadge tone={r.tipo === "ABAIXO_FAIXA" ? "warning" : "brand"}>
                {r.tipo === "ABAIXO_FAIXA" ? "Abaixo da faixa" : "Acima da faixa"}
              </RelatorioBadge>
            ),
          },
          { header: "Salário", numeric: true, render: (r) => brl(r.salary) },
          { header: "Faixa do cargo", numeric: true, render: (r) => `${brl(r.rangeMin)} – ${brl(r.rangeMax)}` },
          {
            header: "Desvio",
            numeric: true,
            render: (r) => (
              <span className={r.tipo === "ABAIXO_FAIXA" ? "text-warning font-medium" : "text-brand font-medium"}>
                {r.desvioPct != null ? `${r.desvioPct > 0 ? "+" : ""}${r.desvioPct}%` : "—"}
              </span>
            ),
          },
        ]}
      />
    </PageContainer>
  );
}
