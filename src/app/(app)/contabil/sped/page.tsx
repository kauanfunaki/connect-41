import { ArrowRight, Calculator, CheckCircle2, CircleAlert, FileSpreadsheet, FileText, ListChecks, Settings2, SquareSlash } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { PendenciasDoContabil } from "@/components/contabil/PendenciasDoContabil";
import { RegrasDoContabil } from "@/components/contabil/RegrasDoContabil";
import { ConfiguracaoDoContabil } from "@/components/contabil/ConfiguracaoDoContabil";
import { ContribuicoesDoContabil } from "@/components/contabil/ContribuicoesDoContabil";
import { DesfazerDescarte } from "@/components/contabil/DesfazerDescarte";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { competenciaDoInstante, competenciaValida, somarMeses } from "@/lib/financeiro/periodo";
import { moeda } from "@/lib/financeiro/formato";
import { formatarCompetencia } from "@/lib/format";
import { empresaDoContabil, painelDoContabil, type PainelDoContabil } from "@/lib/contabil/servidor";
import { painelDeContribuicoes } from "@/lib/contabil/contribuicoes";
import { ROTULO_DA_ORIGEM, TIPOS_DA_ENTRADA, type TipoDaEntrada } from "@/lib/contabil/lancamentos";

export const dynamic = "force-dynamic";

const CAMINHO = "/contabil/sped";
const VISOES = ["pendencias", "lancamentos", "fora", "regras", "configuracao"] as const;
type Visao = (typeof VISOES)[number];
const CODIGO_DO_TIPO: Record<TipoDaEntrada, string> = { "NF-e": "nfe", "CT-e": "cte", "NFS-e": "nfse" };
/** Quantas linhas a tela mostra; a planilha leva todas. */
const LIMITE_DA_PREVIA = 200;

/**
 * O SPED do Contábil (29/10/2026), redesenhado: uma empresa por vez, escolhida
 * no mesmo seletor do BPO, o mês ao lado, e duas abas.
 *
 * - **De-para e lançamentos**: a aba Contábil do SPED Generator, portada e
 *   processada aqui. As notas de entrada do acervo viram lançamentos da
 *   Domínio pelo de-para; o que falta conta aparece como pendência, com as
 *   contas para preencher na própria linha.
 * - **Gerar SPED Contribuições**: pede ao motor do SPED Generator o EFD do mês
 *   e baixa o arquivo. Nada é gerado no Connect.
 *
 * Os números do topo são também a navegação da aba: o cartão escolhido é o
 * recorte de baixo, em vez de uma fileira de abas a mais.
 */
export default async function SpedDoContabilPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("contabil_sped");
  const tenantId = ctx.tenantId;
  const podeAgir = await podeNoModulo(ctx, "contabil_sped", "agir");
  const params = await searchParams;
  // O Contábil fecha o mês anterior: é o que a tela abre.
  const mes = competenciaValida(params.mes) ?? somarMeses(competenciaDoInstante(new Date()), -1);
  const aba = params.aba === "contribuicoes" ? "contribuicoes" : "lancamentos";
  const empresas = await empresasDoSeletor(tenantId);
  const { escolha, empresa, noSeletor, foco } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const companyId = empresa?.id ?? null;

  const href = (mudar: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ empresa: companyId ?? undefined, mes, aba, ...mudar })) if (v) q.set(k, v);
    return `${CAMINHO}?${q}`;
  };
  const cabecalho = <PageHeader title="SPED" subtitle="Lançamentos de entrada para a Domínio e o EFD Contribuições, uma empresa por vez." />;
  const filtro = (
    <FiltroDaEmpresa acao={CAMINHO} empresas={noSeletor} foco={foco} valor={companyId} manter={{ mes, aba }}>
      {companyId && <FiltroDePeriodo acao={CAMINHO} mes={mes} extras={{ empresa: companyId, aba }} naFileira />}
    </FiltroDaEmpresa>
  );

  if (!empresa || !companyId) {
    return (
      <PageContainer>
        {cabecalho}
        {empresas.length === 0 ? <EmptyState title="Nenhuma empresa ativa" icon={<FileSpreadsheet />} /> : <>{filtro}<EscolhaAEmpresa escolha={escolha} porQue="O de-para, os lançamentos e o SPED são de uma empresa por vez." /></>}
      </PageContainer>
    );
  }
  const doContabil = await empresaDoContabil(tenantId, companyId);
  const abas = (
    <AbasDeLink
      ativa={aba}
      abas={[
        { chave: "lancamentos", rotulo: "De-para e lançamentos", href: href({ aba: "lancamentos", ver: undefined }), icone: <ListChecks size={15} aria-hidden /> },
        { chave: "contribuicoes", rotulo: "Gerar SPED Contribuições", href: href({ aba: "contribuicoes", ver: undefined }), icone: <Calculator size={15} aria-hidden /> },
      ]}
    />
  );

  if (!doContabil) return <PageContainer>{cabecalho}{filtro}<EmptyState title="Empresa não encontrada" /></PageContainer>;

  if (aba === "contribuicoes") {
    const painel = await painelDeContribuicoes(tenantId, doContabil.cnpj, mes);
    return (
      <PageContainer>
        {cabecalho}
        {filtro}
        {abas}
        {painel.situacao === "sem_motor" ? (
          <EmptyState icon={<Settings2 />} title="O motor do SPED não está configurado" description="O EFD Contribuições é gerado pelo motor do SPED Generator. Configure a URL e os tokens na integração do SPED para gerar por aqui."
            action={<Button href="/admin/integracoes" variant="secondary">Configurar integração</Button>} />
        ) : painel.situacao === "sem_cnpj" ? (
          <Aviso tom="atencao">Esta empresa não tem CNPJ no cadastro. O EFD Contribuições é por raiz de CNPJ.</Aviso>
        ) : painel.situacao === "raiz_fora" ? (
          <Aviso tom="atencao">A raiz {painel.raiz} não está entre as empresas que o motor do SPED atende para este escritório. Confira as raízes autorizadas na integração.</Aviso>
        ) : painel.situacao === "erro" ? (
          <Aviso>{painel.mensagem}</Aviso>
        ) : (
          <ContribuicoesDoContabil empresaId={companyId} competencia={mes} raiz={painel.raiz} escrita={painel.escrita} podeAgir={podeAgir} execucoes={painel.execucoes} arquivos={painel.arquivos} />
        )}
      </PageContainer>
    );
  }

  const painel = await painelDoContabil(tenantId, doContabil, mes);
  const pedida = VISOES.find((v) => v === params.ver);
  const ver: Visao = pedida ?? (painel.pendencias.length ? "pendencias" : "lancamentos");
  const c = painel.conferencia;
  const daMatriz = doContabil.baseId !== doContabil.id ? (empresas.find((e) => e.id === doContabil.baseId)?.nome ?? "a matriz") : null;
  const semConfiguracao = !painel.configuracao.contasNoPlano;

  return (
    <PageContainer>
      {cabecalho}
      {filtro}
      {abas}
      {c.entradas === 0 ? (
        <EmptyState icon={<FileText />} title={`Nenhuma nota de entrada em ${formatarCompetencia(mes)}`}
          description="Os lançamentos saem das NF-e, CT-e e NFS-e em que a empresa é a destinatária, no acervo fiscal. Confira se as notas do mês já chegaram."
          action={<Button href={`/documentos-fiscais?empresa=${companyId}`} variant="secondary">Abrir o acervo fiscal</Button>} />
      ) : (
        <>
          <FaixaDeTotais
            itens={[
              { rotulo: "Notas de entrada", valor: moeda(c.centavos), detalhe: TIPOS_DA_ENTRADA.filter((t) => c.porTipo[t]).map((t) => `${c.porTipo[t]} ${t}`).join(" · "), icone: <FileText size={16} /> },
              { rotulo: "Prontas para a Domínio", valor: String(c.lancadas), detalhe: moeda(painel.lancamentos.reduce((s, l) => s + l.centavos, 0)), tom: "text-success-fg", icone: <CheckCircle2 size={16} />, href: href({ ver: "lancamentos" }), ativo: ver === "lancamentos" },
              { rotulo: "Pendentes", valor: String(c.pendentes), detalhe: c.pendentes ? `${contarItens(painel.pendencias.length, "fornecedor", "fornecedores")} sem conta` : "Nada sem conta", tom: c.pendentes ? "text-warning-fg" : "text-fg-muted", icone: <CircleAlert size={16} />, href: href({ ver: "pendencias" }), ativo: ver === "pendencias" },
              { rotulo: "Fora dos lançamentos", valor: String(c.fora), detalhe: "Canceladas, zeradas e desconsideradas", tom: "text-fg-muted", icone: <SquareSlash size={16} />, href: href({ ver: "fora" }), ativo: ver === "fora" },
            ]}
          />
          {semConfiguracao && ver !== "configuracao" && (
            <Aviso tom="info" className="my-4 flex flex-wrap items-center justify-between gap-2">
              <span>Carregue o plano de contas da Domínio para ver o nome das contas e receber sugestões de conta nas pendências.</span>
              <Button size="sm" variant="secondary" href={href({ ver: "configuracao" })}>Configurar <ArrowRight size={14} aria-hidden /></Button>
            </Aviso>
          )}
          {c.semCfop > 0 && ver === "pendencias" && (
            <p className="mt-4 text-helper text-fg-muted">{contarItens(c.semCfop, "nota chegou", "notas chegaram")} sem XML no acervo, então sem CFOP: valem para elas as regras gerais do fornecedor.</p>
          )}
        </>
      )}

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-card-title font-semibold text-fg">{TITULO[ver]}</h2>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant={ver === "regras" ? "secondary" : "ghost"} href={href({ ver: "regras" })}>Regras do de-para{painel.regras.length ? ` (${painel.regras.length})` : ""}</Button>
          <Button size="sm" variant={ver === "configuracao" ? "secondary" : "ghost"} href={href({ ver: "configuracao" })}><Settings2 size={14} aria-hidden /> Plano e contas</Button>
        </div>
      </div>

      {ver === "pendencias" && c.entradas > 0 && <PendenciasDoContabil empresaId={companyId} pendencias={painel.pendencias} podeAgir={podeAgir} />}
      {ver === "lancamentos" && c.entradas > 0 && <Lancamentos painel={painel} baixar={(tipo, formato) => `/api/contabil/lancamentos?${new URLSearchParams({ empresa: companyId, mes, tipo: CODIGO_DO_TIPO[tipo], formato })}`} />}
      {ver === "fora" && c.entradas > 0 && <Fora painel={painel} empresaId={companyId} podeAgir={podeAgir} />}
      {ver === "regras" && <RegrasDoContabil empresaId={companyId} regras={painel.regras} podeAgir={podeAgir} />}
      {ver === "configuracao" && <ConfiguracaoDoContabil empresaId={companyId} configuracao={painel.configuracao} podeAgir={podeAgir} daMatriz={daMatriz} />}
    </PageContainer>
  );
}

const TITULO: Record<Visao, string> = {
  pendencias: "Fornecedores sem conta",
  lancamentos: "Lançamentos para a Domínio",
  fora: "Fora dos lançamentos",
  regras: "Regras do de-para",
  configuracao: "Plano de contas e contas fixas",
};

function Lancamentos({ painel, baixar }: { painel: PainelDoContabil; baixar: (tipo: TipoDaEntrada, formato: "xlsx" | "txt") => string }) {
  const { lancamentos } = painel;
  if (!lancamentos.length) return <EmptyState title="Nenhum lançamento pronto" description="Preencha as contas das pendências para as notas virarem lançamentos." />;
  const porTipo = TIPOS_DA_ENTRADA.map((t) => ({ t, linhas: lancamentos.filter((l) => l.tipo === t) })).filter((x) => x.linhas.length);
  return (
    <div className="space-y-4">
      {/* Um arquivo por tipo: a Domínio importaria em dobro as NF-e que já subiram. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {porTipo.map(({ t, linhas }) => (
          <div key={t} className="rounded-lg border border-border bg-surface p-4">
            <p className="font-medium text-fg">{t}</p>
            <p className="text-helper text-fg-secondary">{contarItens(linhas.length, "lançamento", "lançamentos")} · {moeda(linhas.reduce((s, l) => s + l.centavos, 0))}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" href={baixar(t, "xlsx")} download><FileSpreadsheet size={14} aria-hidden /> Planilha</Button>
              <Button size="sm" variant="secondary" href={baixar(t, "txt")} download>.txt</Button>
            </div>
          </div>
        ))}
      </div>
      <CascoDaTabela contagem={contarItens(lancamentos.length, "lançamento", "lançamentos")} total={moeda(lancamentos.reduce((s, l) => s + l.centavos, 0))}>
        <div className="overflow-x-auto">
          <table className="w-full text-ui">
            <thead>
              <tr className="text-left text-fg-secondary">
                {["Data", "Nota", "Fornecedor", "Débito", "Crédito", "Valor", "Histórico"].map((h) => <th key={h} scope="col" className={`px-3 py-2 font-medium border-b border-border ${h === "Valor" ? "text-right" : ""}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lancamentos.slice(0, LIMITE_DA_PREVIA).map((l) => (
                <tr key={l.chave} className="border-b border-border last:border-0 align-top">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{l.data.split("-").reverse().join("/")}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.tipo} {l.numero}</td>
                  <td className="px-3 py-2 max-w-56 truncate" title={l.nomeFornecedor}>{l.nomeFornecedor}</td>
                  <td className="px-3 py-2 tabular-nums" title={l.debitoNome}>{l.debito}{l.imobilizado && <Selo className="ml-1.5">Imobilizado</Selo>}</td>
                  <td className="px-3 py-2 tabular-nums" title={l.creditoNome}>{l.credito}{l.origemDoCredito.startsWith("plano") && <Selo tom="atencao" className="ml-1.5">Conferir</Selo>}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{moeda(l.centavos)}</td>
                  <td className="px-3 py-2 min-w-64 text-fg-secondary" title={ROTULO_DA_ORIGEM[l.origemDoCredito]}>{l.historico}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CascoDaTabela>
      {lancamentos.length > LIMITE_DA_PREVIA && <p className="text-helper text-fg-muted">Mostrando {LIMITE_DA_PREVIA} de {lancamentos.length}. A planilha leva todos.</p>}
      {lancamentos.some((l) => l.origemDoCredito.startsWith("plano")) && <p className="text-helper text-fg-muted">“Conferir”: o crédito veio do plano de contas (mesmo nome ou CNPJ do MEI), não de uma regra.</p>}
    </div>
  );
}

function Fora({ painel, empresaId, podeAgir }: { painel: PainelDoContabil; empresaId: string; podeAgir: boolean }) {
  if (!painel.descartados.length) return <EmptyState title="Nada fora dos lançamentos" description="Notas canceladas, de valor zero ou deixadas de fora aparecem aqui, contadas." />;
  const MOTIVO = { cancelado: "Cancelada", valor_zero: "Valor zero", desconsiderado: "Deixado de fora" } as const;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {painel.descartados.map((d) => {
        const regra = d.motivo === "desconsiderado" ? painel.regras.find((r) => r.desconsiderar && r.cnpjFornecedor === d.cnpj && r.cfop === d.cfop) : undefined;
        return (
          <li key={`${d.motivo}|${d.rotulo}`} className="flex flex-wrap items-center justify-between gap-3 p-4 text-label">
            <div className="min-w-0">
              <p className="font-medium text-fg">{d.rotulo}</p>
              <p className="text-helper text-fg-secondary">{contarItens(d.qtd, "nota", "notas")} · {moeda(d.centavos)}</p>
            </div>
            <span className="flex items-center gap-2"><Selo>{MOTIVO[d.motivo]}</Selo>{regra && podeAgir && <DesfazerDescarte empresaId={empresaId} regraId={regra.id} />}</span>
          </li>
        );
      })}
    </ul>
  );
}
