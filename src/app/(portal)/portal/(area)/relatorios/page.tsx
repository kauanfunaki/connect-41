import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { TabelaDoConsolidado } from "@/components/financeiro/FluxoDeCaixa";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { dadosDoConsolidado, nomesDasEmpresas } from "@/lib/financeiro/consultas";
import { consolidarPorEmpresa } from "@/lib/financeiro/fluxo";
import { competenciaValida, competenciaDoInstante } from "@/lib/financeiro/periodo";
import { formatarCompetencia } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";

export const dynamic = "force-dynamic";

export default async function PortalRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_fluxo_caixa")) notFound();

  const params = await searchParams;
  const agora = new Date();
  const mes = competenciaValida(params.mes) ?? competenciaDoInstante(agora);
  const { somas, vencidas } = await dadosDoConsolidado(escopo, mes, saoPauloParts(agora).dateKey);
  const linhas = consolidarPorEmpresa(somas, vencidas);
  const nomes = await nomesDasEmpresas(escopo.tenantId, linhas.map((l) => l.companyId));

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Relatório"
        descricao={`Consolidado por empresa em ${formatarCompetencia(mes)}.`}
      />
      <FiltroDePeriodo acao="/portal/relatorios" mes={mes} />
      <TabelaDoConsolidado linhas={linhas} nomes={nomes} />
      {/* Nota em `text-helper` (13px) desde 07/10/2026: era 11px, o tamanho do
          cabeçalho de tabela, numa explicação que o cliente lê no celular. */}
      <p className="text-helper text-fg-muted mt-2">
        Pago e recebido pela data da baixa. Vencidas é a posição de hoje.
      </p>
    </PageContainer>
  );
}
