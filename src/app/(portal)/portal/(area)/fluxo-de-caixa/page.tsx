import { notFound } from "next/navigation";
import { CalendarRange, FlaskConical, History } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { TituloDeSecao } from "@/components/portal/TituloDeSecao";
import { SeletorDeEmpresaQueNavega } from "@/components/shared/SeletorDeEmpresaQueNavega";
import { AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { empresaDaTela } from "@/lib/portal/empresaEscolhida";
import { empresaGuardadaDoPortal } from "@/lib/portal/empresaEscolhidaServidor";
import { TabelaDoRealizado, CartoesDaProjecao } from "@/components/financeiro/FluxoDeCaixa";
import { PrevistoDoFluxo } from "@/components/financeiro/PrevistoDoFluxo";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { TelaIndisponivel } from "@/components/portal/TelaIndisponivel";
import { empresasDoSeletor, movimentosRealizados, titulosEmAberto, type EscopoFinanceiro } from "@/lib/financeiro/consultas";
import { fluxoRealizado, projecaoPorJanela } from "@/lib/financeiro/fluxo";
import { competenciaDoInstante, competenciasAte } from "@/lib/financeiro/periodo";
import { configuracaoDoFluxo, dadosDoCenario, dadosDoPrevisto } from "@/lib/fluxoDeCaixa/previstoServidor";
import { CenarioDoFluxo } from "@/components/financeiro/CenarioDoFluxo";
import { celulaDeTexto, granularidadeValida, type Granularidade } from "@/lib/fluxoDeCaixa/projecao";
import { saoPauloParts } from "@/lib/agenda";

export const dynamic = "force-dynamic";

/**
 * Fluxo de caixa do cliente: o previsto (25/11/2026, funcionalidade-837, a
 * opção C) e o que já aconteceu. A empresa escolhida na URL só vale se estiver
 * no grupo — senão cai em "todas as suas", nunca na de outro.
 *
 * O previsto abre primeiro: é o que o cliente pediu ver. É de uma empresa por
 * vez (o saldo, a data de caixa e a nomenclatura são da empresa); com mais de
 * uma e "todas" escolhida, a tela pede a empresa.
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
  const pedida = params.aba === "realizado" || params.aba === "cenario" ? params.aba : "previsto";
  const ver = granularidadeValida(params.ver);
  const empresas = await empresasDoSeletor(escopo.tenantId, escopo.companyIds ?? []);
  // A da URL, ou a guardada da última escolha no portal (11/11/2026).
  const empresaId = empresaDaTela(
    params.empresa,
    await empresaGuardadaDoPortal(),
    empresas.map((e) => e.id)
  );
  // Com uma empresa só, o previsto é dela, mesmo sem escolha.
  const empresaDoPrevisto = empresaId ?? (empresas.length === 1 ? empresas[0]!.id : null);

  // A aba Cenário só aparece quando a equipe deixa o cliente ver (Modelo do fluxo).
  const comCenario = empresaDoPrevisto ? (await configuracaoDoFluxo(escopo.tenantId, empresaDoPrevisto)).cenarioNoPortal : false;
  const aba = pedida === "cenario" && !comCenario ? "previsto" : pedida;

  const comEmpresa = (q: string) => `/portal/fluxo-de-caixa?${q}${empresaId ? `&empresa=${empresaId}` : ""}`;
  const enderecoDaVisao = (g: Granularidade) => comEmpresa(`aba=previsto&ver=${g}`);

  return (
    <PageContainer>
      <PortalCabecalho titulo="Fluxo de caixa" descricao="O saldo das suas contas, o que está previsto entrar e sair, e o que já aconteceu." />
      {/* Troca ao escolher, sem "Aplicar" (P11): aqui não há mês junto. */}
      {empresas.length > 1 && (
        <SeletorDeEmpresaQueNavega
          acao="/portal/fluxo-de-caixa"
          empresas={empresas}
          empresaId={empresaId}
          permitirTodas
          manter={aba === "previsto" ? { aba: "previsto", ver } : { aba }}
        />
      )}
      <AbasDeLink
        abas={[
          { chave: "previsto", rotulo: "Previsto", href: enderecoDaVisao(ver), icone: <CalendarRange /> },
          ...(comCenario ? [{ chave: "cenario", rotulo: "Cenário", href: comEmpresa("aba=cenario"), icone: <FlaskConical /> }] : []),
          { chave: "realizado", rotulo: "Já aconteceu", href: comEmpresa("aba=realizado"), icone: <History /> },
        ]}
        ativa={aba}
      />

      {aba === "previsto" ? (
        empresaDoPrevisto ? (
          <PrevistoDoFluxo
            dados={await dadosDoPrevisto({ tenantId: escopo.tenantId, companyId: empresaDoPrevisto, granularidade: ver, celula: celulaDeTexto(params.celula) })}
            enderecoDaVisao={enderecoDaVisao}
            exportarHref={`/portal/fluxo-de-caixa/exportar?empresa=${empresaDoPrevisto}`}
            noPortal
          />
        ) : (
          <Card>
            <EmptyState
              title="Escolha uma empresa"
              description="O previsto é de uma empresa por vez: o saldo das contas e o que entra e sai são de cada uma. Escolha a empresa acima."
            />
          </Card>
        )
      ) : aba === "cenario" && empresaDoPrevisto ? (
        <CenarioDoFluxo dados={await dadosDoCenario(escopo.tenantId, empresaDoPrevisto)} noPortal />
      ) : (
        <JaAconteceu escopo={empresaId ? { ...escopo, companyIds: [empresaId] } : escopo} />
      )}
    </PageContainer>
  );
}

/** O que era a tela inteira até 25/11: os seis meses que passaram e as janelas do que vence. */
async function JaAconteceu({ escopo }: { escopo: EscopoFinanceiro }) {
  const agora = new Date();
  const competencias = competenciasAte(competenciaDoInstante(agora), 6);
  const [movimentos, titulos] = await Promise.all([movimentosRealizados(escopo, competencias), titulosEmAberto(escopo)]);
  return (
    <>
      {/* Títulos de seção no desenho do Início (`TituloDeSecao`, 08/10/2026).
          "O que já entrou e saiu", e não "Realizado" (P20): palavra da equipe. */}
      <TituloDeSecao>O que já entrou e saiu</TituloDeSecao>
      <TabelaDoRealizado meses={fluxoRealizado(movimentos, competencias)} noPortal />

      <TituloDeSecao className="mt-6">A vencer a partir de hoje</TituloDeSecao>
      <CartoesDaProjecao projecao={projecaoPorJanela(titulos, saoPauloParts(agora).dateKey)} noPortal />
      <p className="text-helper text-fg-muted mt-2">
        Soma só o que já está lançado: a receber menos a pagar, pelo vencimento. O saldo das contas e o detalhe por categoria estão em
        “Previsto”.
      </p>
    </>
  );
}
