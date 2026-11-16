import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { AbasDaDre } from "@/components/dre/AbasDaDre";
import { SeletorDeAnalise } from "@/components/dre/analises/SeletorDeAnalise";
import { ANALISES_DA_DRE, analiseDaUrl, hrefDaAnalise } from "@/lib/dre/analisesDaTela";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
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

/**
 * As análises gerenciais da DRE, numa tela só.
 *
 * Uma tela e não sete porque todas respondem sobre a mesma empresa e o mesmo
 * mês: trocar de análise não pode perder o filtro, e sete rotas soltas sete
 * vezes o seletor. Cada análise busca só o próprio dado.
 *
 * As sete eram abas, uma segunda fileira embaixo das quatro DREs; desde
 * 16/11/2026 (melhoria-718) se escolhem no seletor "Análise", na fileira do
 * mês (`analisesDaTela.ts`). O endereço (`?aba=`) é o mesmo.
 */
export default async function AnalisesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const aba = analiseDaUrl(params.aba);
  // A empresa da URL, a última aberta pela pessoa — ou nenhuma, e a tela pede
  // (13/10/2026); era a primeira em ordem alfabética.
  const empresas = await empresasDoSeletor(ctx.tenantId);
  // Com uma empresa em foco (21/10/2026), só ela, a matriz e as filiais.
  const { escolha, empresa, noSeletor, foco } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const companyId = empresa?.id ?? null;

  if (!empresa || !companyId) {
    return (
      <PageContainer>
        <PageHeader title="DRE" subtitle="Análises e reconciliação, sobre a DRE por competência e o caixa." />
        {empresas.length === 0 ? (
          <EmptyState title="Nenhuma empresa ativa" icon={<FileText />} />
        ) : (
          <>
            <FiltroDaEmpresa foco={foco} />
            <EscolhaAEmpresa escolha={escolha} porQue="As análises são de uma empresa por vez." />
          </>
        )}
      </PageContainer>
    );
  }

  // Todo formulário desta tela grava na empresa escolhida — o rodapé diz qual.
  const comEmpresa = (tela: React.ReactNode) => (
    <EmpresaDaTela empresa={{ nome: empresa.nome, cnpj: empresa.cnpj }}>{tela}</EmpresaDaTela>
  );

  const comMovimento = await competenciasDaEmpresa(ctx.tenantId, companyId);
  const mes = competenciaValida(params.mes) ?? comMovimento[0] ?? competenciaDoInstante(new Date());
  const base = { tenantId: ctx.tenantId, companyId, mes };

  return comEmpresa(
    <PageContainer>
      {/* "DRE", com a aba Análises e reconciliação marcada embaixo (05/11/2026,
          escolha 6A do Kauan): as quatro DREs são abas de uma tela só. */}
      <PageHeader
        title="DRE"
        subtitle={`Análises e reconciliação de ${rotuloDaCompetencia(mes)}, sobre a DRE por competência e o caixa — cálculo determinístico, sem IA externa.`}
      />
      <AbasDaDre ativa="analises" companyId={companyId} mes={mes} />
      {/* A empresa navega sozinha (e vira a última aberta); a análise também,
          ao escolher; o mês, com "Aplicar". */}
      <FiltroDaEmpresa foco={foco}>
        <SeletorDeAnalise
          ativa={aba}
          analises={ANALISES_DA_DRE.map((a) => ({ ...a, href: hrefDaAnalise(a.chave, companyId, mes) }))}
        />
        <FiltroDePeriodo acao="/dre/analises" mes={mes} mesEmNumero extras={{ empresa: companyId, aba }} naFileira />
      </FiltroDaEmpresa>

      {aba === "economico-financeiro" && <AbaEconomicoFinanceiro {...base} />}
      {aba === "reconciliacao" && <AbaReconciliacao {...base} />}
      {aba === "comparativos" && (
        <AbaComparativos {...base} modo={params.modo} regime={params.regime} empresa2={params.empresa2} empresas={noSeletor} />
      )}
      {aba === "forecast" && <AbaForecast {...base} metodo={params.metodo} />}
      {aba === "cenarios" && <AbaCenarios {...base} />}
      {aba === "indicadores" && <AbaIndicadores {...base} />}
      {aba === "cfo" && <AbaCfo {...base} pergunta={params.pergunta} />}
    </PageContainer>
  );
}
