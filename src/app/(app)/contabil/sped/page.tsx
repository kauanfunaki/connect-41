import { iconeDaAbaFiscal } from "@/components/fiscal/iconeDaAbaFiscal";
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
import { empresaContabilVisivel, painelDasSaidas, painelDoContabil, type EmpresaDoContabil } from "@/lib/contabil/servidor";
import { areaContabil, etapaDaSecao, secoesDoGrupo, ETAPAS_DO_CONTABIL, SECOES_DO_CONTABIL } from "@/lib/contabil/navegacao";
import { EtapasNumeradas } from "@/components/ui/EtapasNumeradas";
import { DeparaWorkspace } from "@/components/contabil/DeparaWorkspace";
import { AreasContribuicoes } from "@/components/contabil/AreasContribuicoes";
import { LimiteDaAreaContabil } from "@/components/contabil/LimiteDaAreaContabil";
import { SaidasDoContabil } from "@/components/contabil/SaidasDoContabil";
import { LoteDoAno } from "@/components/contabil/LoteDoAno";
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
  // Contribuições segue em seções; de-para e lançamentos viraram etapas
  // (03/11/2026), e o `grupo` antigo da URL deixou de mandar na tela.
  const contribuicoes = aba === "contribuicoes";
  const pedida = areaContabil(params);
  const secoesValidas = contribuicoes ? secoesDoGrupo("contribuicoes").map(([id]) => id) : SECOES_DO_CONTABIL;
  const secao = (params.secao || params.ver) && secoesValidas.includes(pedida) ? pedida : secoesValidas[0];
  const etapa = contribuicoes ? null : etapaDaSecao(secao);
  const areas = etapa ? etapa.secoes : secoesDoGrupo("contribuicoes");
  const titulo = contribuicoes ? "Gerar SPED Contribuições" : "De-para e lançamentos";
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const { escolha, empresa, noSeletor, foco } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const companyId = empresa?.id;
  const doContabil = companyId ? await empresaContabilVisivel(ctx, companyId) : null;
  const href = (mudar: Params) => CAMINHO + "?" + new URLSearchParams(Object.fromEntries(Object.entries({ empresa: companyId, mes, aba, secao, ...mudar }).filter(([, v]) => v)) as Record<string, string>);
  const daMatriz = doContabil && doContabil.baseId !== doContabil.id ? empresas.find((e) => e.id === doContabil.baseId)?.nome ?? "Matriz" : null;
  return <PageContainer>
    <PageHeader title={titulo} subtitle={contribuicoes ? "Conferência e geração pelo motor remoto." : "Das notas de entrada à planilha da Domínio: o que ficar sem de-para vira regra, e os lançamentos saem completos."} />
    <FiltroDaEmpresa acao={CAMINHO} empresas={noSeletor} foco={foco} valor={companyId ?? null} manter={{ mes, aba, secao }}>
      {companyId && <FiltroDePeriodo acao={CAMINHO} mes={mes} extras={{ empresa: companyId, aba, secao }} naFileira />}
    </FiltroDaEmpresa>
    {etapa && <EtapasNumeradas aria-label="Etapas do de-para e lançamentos" atual={etapa.chave} etapas={ETAPAS_DO_CONTABIL.map((e) => ({ chave: e.chave, rotulo: e.rotulo, resumo: e.resumo, href: href({ secao: e.secoes[0][0] }) }))} />}
    {areas.length > 1 && <AbasDeLink aria-label={"Seções de " + (etapa?.rotulo ?? titulo)} ativa={secao} abas={areas.map(([id, nome]) => ({ icone: iconeDaAbaFiscal(id, nome), chave: id, rotulo: nome, href: href({ secao: id }) }))} />}
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
  if (secao === "lote") return <LoteDoAno empresaId={empresa.id} mes={mes} />;
  if (secao === "saidas") {
    const dados = await Promise.all([painelDasSaidas(ctx.tenantId, empresa, mes), podeNoModulo(ctx, "contabil_sped", "agir")]).catch((err) => {
      console.error("[contabil/sped] saídas indisponíveis", err);
      return null;
    });
    if (!dados) return <Aviso tom="atencao">Não foi possível carregar as saídas. Tente novamente. As outras etapas continuam disponíveis.</Aviso>;
    return <SaidasDoContabil painel={dados[0]} empresaId={empresa.id} mes={mes} podeAgir={dados[1]} />;
  }
  const dados = await Promise.all([painelDoContabil(ctx.tenantId, empresa, mes, { entradas: secao !== "configuracao" && secao !== "regras", sugestoes: secao === "pendencias" }), podeNoModulo(ctx, "contabil_sped", "agir")]).catch((err) => {
    console.error("[contabil/sped] área indisponível", err);
    return null;
  });
  if (!dados) return <Aviso tom="atencao">Não foi possível carregar esta área. Tente novamente. As outras áreas continuam disponíveis.</Aviso>;
  const [painel, podeAgir] = dados;
  return <DeparaWorkspace key={empresa.id + mes + secao + JSON.stringify(params)} painel={painel} empresaId={empresa.id} mes={mes} secao={secao} filtros={{ ...params, situacao: params.situacao ?? (params.ver === "fora" ? "fora" : undefined) }} podeAgir={podeAgir} permiteExcluir={podeExcluir(ctx)} daMatriz={daMatriz} />;
}
