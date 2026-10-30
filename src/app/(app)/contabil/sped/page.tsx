import { Suspense } from "react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { competenciaDoInstante, competenciaValida, somarMeses } from "@/lib/financeiro/periodo";
import { empresaContabilVisivel, painelDoContabil, type EmpresaDoContabil } from "@/lib/contabil/servidor";
import { areaContabil, grupoContabil, secoesDoGrupo } from "@/lib/contabil/navegacao";
import { DeparaWorkspace } from "@/components/contabil/DeparaWorkspace";
import { AreasContribuicoes } from "@/components/contabil/AreasContribuicoes";
import { LimiteDaAreaContabil } from "@/components/contabil/LimiteDaAreaContabil";
import type { AuthContext } from "@/lib/auth/context";
import { podeExcluir } from "@/lib/auth/papeis";

export const dynamic = "force-dynamic";
const CAMINHO = "/contabil/sped";
type Params = Record<string, string | undefined>;

export default async function SpedDoContabilPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("contabil_sped");
  const params: Params = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const mes = competenciaValida(params.mes) ?? somarMeses(competenciaDoInstante(new Date()), -1);
  const aba = params.aba === "contribuicoes" ? "contribuicoes" : "lancamentos";
  const grupo = grupoContabil(params);
  const areas = secoesDoGrupo(grupo);
  const pedida = areaContabil(params);
  const secao = (params.secao || params.ver) && areas.some(([id]) => id === pedida) ? pedida : areas[0][0];
  const titulo = grupo === "depara" ? "De-para" : grupo === "lancamentos" ? "Lançamentos" : "Gerar SPED Contribuições";
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const { escolha, empresa, noSeletor, foco } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const companyId = empresa?.id;
  const doContabil = companyId ? await empresaContabilVisivel(ctx, companyId) : null;
  const href = (mudar: Params) => CAMINHO + "?" + new URLSearchParams(Object.fromEntries(Object.entries({ empresa: companyId, mes, aba, grupo, secao, ...mudar }).filter(([, v]) => v)) as Record<string, string>);
  const daMatriz = doContabil && doContabil.baseId !== doContabil.id ? empresas.find((e) => e.id === doContabil.baseId)?.nome ?? "Matriz" : null;
  return <PageContainer>
    <PageHeader title={titulo} subtitle={grupo === "depara" ? "Regras contábeis, pendências e plano de contas." : grupo === "lancamentos" ? "Consulte as entradas e prepare os arquivos para a Domínio." : "Conferência e geração pelo motor remoto."} />
    <FiltroDaEmpresa acao={CAMINHO} empresas={noSeletor} foco={foco} valor={companyId ?? null} manter={{ mes, aba, grupo, secao }}>
      {companyId && <FiltroDePeriodo acao={CAMINHO} mes={mes} extras={{ empresa: companyId, aba, grupo, secao }} naFileira />}
    </FiltroDaEmpresa>
    <AbasDeLink aria-label={"Seções de " + titulo} ativa={secao} abas={areas.map(([id, nome]) => ({ chave: id, rotulo: nome, href: href({ secao: id }) }))} />
    <div>
      <section className="min-w-0" aria-label={areas.find(([id]) => id === secao)?.[1]}>
        {!doContabil ? empresas.length === 0 ? <EmptyState title="Nenhuma empresa ativa" /> : <EscolhaAEmpresa escolha={escolha} porQue="Selecione a empresa para consultar ou trabalhar nesta área." /> : <LimiteDaAreaContabil key={[aba, secao, companyId, mes, JSON.stringify(params)].join("|")}><Suspense fallback={<div role="status" className="animate-pulse rounded-lg border border-border p-6 text-label text-fg-muted">Carregando esta área…</div>}>
          <Conteudo ctx={ctx} empresa={doContabil} mes={mes} aba={aba} secao={secao} params={params} daMatriz={daMatriz} />
        </Suspense></LimiteDaAreaContabil>}
      </section>
    </div>
  </PageContainer>;
}

async function Conteudo({ ctx, empresa, mes, aba, secao, params, daMatriz }: { ctx: AuthContext; empresa: EmpresaDoContabil; mes: string; aba: string; secao: string; params: Params; daMatriz: string | null }) {
  if (aba === "contribuicoes") return <AreasContribuicoes ctx={ctx} empresa={empresa} mes={mes} secao={secao} params={params} />;
  const dados = await Promise.all([painelDoContabil(ctx.tenantId, empresa, mes, { entradas: secao !== "configuracao" && secao !== "regras", sugestoes: secao === "pendencias" }), podeNoModulo(ctx, "contabil_sped", "agir")]).catch((err) => {
    console.error("[contabil/sped] área indisponível", err);
    return null;
  });
  if (!dados) return <Aviso tom="atencao">Não foi possível carregar esta área. Tente novamente. As outras áreas continuam disponíveis.</Aviso>;
  const [painel, podeAgir] = dados;
  return <DeparaWorkspace key={empresa.id + mes + secao + JSON.stringify(params)} painel={painel} empresaId={empresa.id} mes={mes} secao={secao} filtros={{ ...params, situacao: params.situacao ?? (params.ver === "fora" ? "fora" : undefined) }} podeAgir={podeAgir} permiteExcluir={podeExcluir(ctx)} daMatriz={daMatriz} />;
}
