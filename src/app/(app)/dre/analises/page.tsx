import { notFound } from "next/navigation";
import {
  ArrowLeftRight,
  Columns2,
  FileText,
  Gauge,
  GitMerge,
  MessageCircleQuestion,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import {
  AbaEconomicoFinanceiro,
  AbaReconciliacao,
  AbaComparativos,
  AbaForecast,
  AbaCenarios,
  AbaIndicadores,
  AbaCfo,
} from "@/components/dre/analises/AbasDeAnalise";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { competenciasDaEmpresa } from "@/lib/dre/dataEconomica";
import { competenciaValida, competenciaDoInstante, rotuloDaCompetencia } from "@/lib/financeiro/periodo";

export const dynamic = "force-dynamic";

const MODULE = "dre_analises";
// Setor que opera o módulo neste tenant (ver `setorDoModulo`); o do catálogo
// é só o padrão.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

// Com ícone, como as abas das outras telas polidas em 30/09.
const ABAS = [
  { chave: "economico-financeiro", rotulo: "Econômico × financeiro", icone: <ArrowLeftRight /> },
  { chave: "reconciliacao", rotulo: "Reconciliação lucro → caixa", icone: <GitMerge /> },
  { chave: "comparativos", rotulo: "Comparativos", icone: <Columns2 /> },
  { chave: "forecast", rotulo: "Forecast", icone: <TrendingUp /> },
  { chave: "cenarios", rotulo: "Cenários", icone: <SlidersHorizontal /> },
  { chave: "indicadores", rotulo: "Indicadores", icone: <Gauge /> },
  { chave: "cfo", rotulo: "CFO", icone: <MessageCircleQuestion /> },
] as const;

/**
 * As análises gerenciais da DRE, numa tela com abas.
 *
 * Uma tela e não sete porque todas respondem sobre a mesma empresa e o mesmo
 * mês: trocar de aba não pode perder o filtro, e sete rotas soltas sete vezes
 * o seletor. Cada aba busca só o próprio dado.
 */
export default async function AnalisesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const aba = ABAS.find((a) => a.chave === params.aba)?.chave ?? "economico-financeiro";
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const companyId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : empresas[0]?.id;

  if (!companyId) {
    return (
      <PageContainer>
        <PageHeader title="Análises gerenciais" />
        <EmptyState title="Nenhuma empresa ativa" icon={<FileText />} />
      </PageContainer>
    );
  }

  const comMovimento = await competenciasDaEmpresa(ctx.tenantId, companyId);
  const mes = competenciaValida(params.mes) ?? comMovimento[0] ?? competenciaDoInstante(new Date());
  const base = { tenantId: ctx.tenantId, companyId, mes };

  return (
    <PageContainer>
      <PageHeader
        title="Análises gerenciais"
        subtitle={`Sobre a DRE por competência e o caixa de ${rotuloDaCompetencia(mes)} — cálculo determinístico, sem IA externa.`}
      />
      <FiltroDePeriodo acao="/dre/analises" empresas={empresas} empresaId={companyId} mes={mes} extras={{ aba }} />
      <AbasDeLink
        abas={ABAS.map((a) => ({ ...a, href: `/dre/analises?aba=${a.chave}&empresa=${companyId}&mes=${mes}` }))}
        ativa={aba}
      />

      {aba === "economico-financeiro" && <AbaEconomicoFinanceiro {...base} />}
      {aba === "reconciliacao" && <AbaReconciliacao {...base} />}
      {aba === "comparativos" && (
        <AbaComparativos {...base} modo={params.modo} regime={params.regime} empresa2={params.empresa2} empresas={empresas} />
      )}
      {aba === "forecast" && <AbaForecast {...base} metodo={params.metodo} />}
      {aba === "cenarios" && <AbaCenarios {...base} />}
      {aba === "indicadores" && <AbaIndicadores {...base} />}
      {aba === "cfo" && <AbaCfo {...base} pergunta={params.pergunta} />}
    </PageContainer>
  );
}
