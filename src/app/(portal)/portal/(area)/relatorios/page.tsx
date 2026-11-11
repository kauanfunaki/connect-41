import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { TabelaDoConsolidado } from "@/components/financeiro/FluxoDeCaixa";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { TelaIndisponivel } from "@/components/portal/TelaIndisponivel";
import { dadosDoConsolidado, nomesDasEmpresas } from "@/lib/financeiro/consultas";
import { consolidarPorEmpresa } from "@/lib/financeiro/fluxo";
import { competenciaValida, competenciaDoInstante } from "@/lib/financeiro/periodo";
import { mesPorExtensoDoPortal } from "@/lib/portal/empresaEscolhida";
import { saoPauloParts } from "@/lib/agenda";

export const dynamic = "force-dynamic";

export default async function PortalRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_fluxo_caixa")) notFound();
  if (await telaBloqueadaNoPortal(escopo.tenantId, "/portal/relatorios")) return <TelaIndisponivel />;

  const params = await searchParams;
  const agora = new Date();
  const mes = competenciaValida(params.mes) ?? competenciaDoInstante(agora);
  const { somas, vencidas } = await dadosDoConsolidado(escopo, mes, saoPauloParts(agora).dateKey);
  const linhas = consolidarPorEmpresa(somas, vencidas);
  const nomes = await nomesDasEmpresas(escopo.tenantId, linhas.map((l) => l.companyId));

  return (
    <PageContainer>
      {/* "Resumo do mês por empresa" no lugar de "Consolidado" (P19): o
          cliente não fala a língua do fechamento. */}
      <PortalCabecalho
        titulo="Resumo do mês por empresa"
        descricao={`Quanto cada empresa pagou e recebeu em ${mesPorExtensoDoPortal(mes)}, e as contas vencidas.`}
      />
      <FiltroDePeriodo acao="/portal/relatorios" mes={mes} />
      <TabelaDoConsolidado linhas={linhas} nomes={nomes} noPortal />
      {/* Nota em `text-helper` (13px) desde 07/10/2026: era 11px, o tamanho do
          cabeçalho de tabela, numa explicação que o cliente lê no celular.
          Sem "data da baixa" (P19): palavra da equipe. */}
      <p className="text-helper text-fg-muted mt-2">
        Pago e recebido contam pela data em que foram pagos ou recebidos. As vencidas são as de hoje.
      </p>
    </PageContainer>
  );
}
