import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { TabelaDoRealizado, CartoesDaProjecao } from "@/components/financeiro/FluxoDeCaixa";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { empresasDoSeletor, movimentosRealizados, titulosEmAberto } from "@/lib/financeiro/consultas";
import { fluxoRealizado, projecaoPorJanela } from "@/lib/financeiro/fluxo";
import { competenciaDoInstante, competenciasAte } from "@/lib/financeiro/periodo";
import { saoPauloParts } from "@/lib/agenda";

export const dynamic = "force-dynamic";

/**
 * Fluxo de caixa do cliente: o mesmo realizado e a mesma projeção da equipe,
 * com o escopo trocado pelas empresas do grupo. A empresa escolhida na URL só
 * vale se estiver no grupo — senão cai em "todas as suas", nunca na de outro.
 */
export default async function PortalFluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_fluxo_caixa")) notFound();

  const params = await searchParams;
  const empresas = await empresasDoSeletor(escopo.tenantId, escopo.companyIds ?? []);
  const empresaId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : null;
  const recorte = empresaId ? { ...escopo, companyIds: [empresaId] } : escopo;

  const agora = new Date();
  const competencias = competenciasAte(competenciaDoInstante(agora), 6);
  const [movimentos, titulos] = await Promise.all([movimentosRealizados(recorte, competencias), titulosEmAberto(recorte)]);

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Fluxo de caixa"
        descricao="O que entrou e saiu nos últimos seis meses, e o que vence daqui para frente."
      />
      {empresas.length > 1 && <FiltroDePeriodo acao="/portal/fluxo-de-caixa" empresas={empresas} empresaId={empresaId} permitirTodas />}

      <h2 className="text-[14px] font-semibold text-fg mb-2">Realizado</h2>
      <TabelaDoRealizado meses={fluxoRealizado(movimentos, competencias)} />

      <h2 className="text-[14px] font-semibold text-fg mt-6 mb-2">A vencer a partir de hoje</h2>
      <CartoesDaProjecao projecao={projecaoPorJanela(titulos, saoPauloParts(agora).dateKey)} />
      <p className="text-[11px] text-fg-muted mt-2">
        A projeção soma só o que já está lançado: a receber menos a pagar, pelo vencimento. Não inclui saldo bancário.
      </p>
    </PageContainer>
  );
}
