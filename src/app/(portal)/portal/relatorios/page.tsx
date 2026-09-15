import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { TabelaDoConsolidado } from "@/components/financeiro/FluxoDeCaixa";
import { contextoFinanceiroDoPortal } from "../../financeiro";
import { dadosDoConsolidado, nomesDasEmpresas } from "@/lib/financeiro/consultas";
import { consolidarPorEmpresa } from "@/lib/financeiro/fluxo";
import { competenciaValida, competenciaDoInstante, rotuloDaCompetencia } from "@/lib/financeiro/periodo";
import { saoPauloParts } from "@/lib/agenda";

export const dynamic = "force-dynamic";

export default async function PortalRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { escopo, modulos, grupoNome } = await contextoFinanceiroDoPortal();
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
        descricao={`consolidado por empresa em ${rotuloDaCompetencia(mes)}.`}
        grupoNome={grupoNome}
        ativo="relatorios"
        modulos={modulos}
      />
      <FiltroDePeriodo acao="/portal/relatorios" mes={mes} />
      <TabelaDoConsolidado linhas={linhas} nomes={nomes} />
      <p className="text-[11px] text-fg-muted mt-2">
        Pago e recebido pela data da baixa. Vencidas é a posição de hoje.
      </p>
    </PageContainer>
  );
}
