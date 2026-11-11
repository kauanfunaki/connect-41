import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { TituloDeSecao } from "@/components/portal/TituloDeSecao";
import { SeletorDeEmpresaQueNavega } from "@/components/shared/SeletorDeEmpresaQueNavega";
import { empresaDaTela } from "@/lib/portal/empresaEscolhida";
import { empresaGuardadaDoPortal } from "@/lib/portal/empresaEscolhidaServidor";
import { TabelaDoRealizado, CartoesDaProjecao } from "@/components/financeiro/FluxoDeCaixa";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { TelaIndisponivel } from "@/components/portal/TelaIndisponivel";
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
  if (await telaBloqueadaNoPortal(escopo.tenantId, "/portal/fluxo-de-caixa")) return <TelaIndisponivel />;

  const params = await searchParams;
  const empresas = await empresasDoSeletor(escopo.tenantId, escopo.companyIds ?? []);
  // A da URL, ou a guardada da última escolha no portal (11/11/2026).
  const empresaId = empresaDaTela(
    params.empresa,
    await empresaGuardadaDoPortal(),
    empresas.map((e) => e.id)
  );
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
      {/* Troca ao escolher, sem "Aplicar" (P11): aqui não há mês junto. */}
      {empresas.length > 1 && (
        <SeletorDeEmpresaQueNavega acao="/portal/fluxo-de-caixa" empresas={empresas} empresaId={empresaId} permitirTodas />
      )}

      {/* Títulos de seção no desenho do Início (`TituloDeSecao`, 08/10/2026).
          "O que já entrou e saiu", e não "Realizado" (P20): palavra da equipe. */}
      <TituloDeSecao>O que já entrou e saiu</TituloDeSecao>
      <TabelaDoRealizado meses={fluxoRealizado(movimentos, competencias)} noPortal />

      <TituloDeSecao className="mt-6">A vencer a partir de hoje</TituloDeSecao>
      <CartoesDaProjecao projecao={projecaoPorJanela(titulos, saoPauloParts(agora).dateKey)} noPortal />
      {/* Nota em `text-helper` (13px) desde 07/10/2026: era 11px, o tamanho do
          cabeçalho de tabela, numa explicação que o cliente lê no celular. */}
      <p className="text-helper text-fg-muted mt-2">
        A projeção soma só o que já está lançado: a receber menos a pagar, pelo vencimento. Não inclui saldo bancário.
      </p>
    </PageContainer>
  );
}
