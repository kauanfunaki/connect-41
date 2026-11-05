import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, CalendarRange, FileText, Percent, TrendingUp } from "lucide-react";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getPrisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Accordion } from "@/components/ui/Accordion";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { AbasDaDre } from "@/components/dre/AbasDaDre";
import { FaixaDoRascunho } from "@/components/dre/FaixaDoRascunho";
import { diferencasDaDre } from "@/lib/dre/publicacao";
import { fotoAtualDoMes, garantirFotoInicial, publicacoesDaEmpresa } from "@/lib/dre/publicacaoServidor";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { RelatorioOrcadoRealizado } from "@/components/dre/RelatorioOrcadoRealizado";
import { NumerosDaDre } from "@/components/dre/NumerosDaDre";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import {
  competenciaValida,
  competenciasAte,
  acumuladoDoAno,
  rotuloDaCompetencia,
  competenciaDoInstante,
  partesDaCompetencia,
  somarMeses,
} from "@/lib/financeiro/periodo";
import { serieEconomica, competenciasDaEmpresa, quadroPorCentroDoPeriodo } from "@/lib/dre/dataEconomica";
import { comRotulosEconomicos } from "@/lib/dre/economica";
import { resultadoDePorGrupo, somarPorGrupo } from "@/lib/dre/analises";
import { impostoForaDoResultado } from "@/lib/dre/calculo";
import { opcoesDaUrl } from "@/lib/dre/estrutura";
import { modeloDaEmpresa } from "@/lib/dre/modeloDaEmpresa";
import { sufixoDosImpostos, trocaDosImpostos } from "@/lib/dre/visaoDosImpostos";
import { moeda, tomDoValor } from "@/lib/financeiro/formato";
import { lerFiltroDeCentro, valorDoFiltroDeCentro, SEM_CENTRO } from "@/lib/financeiro/centroDeCusto";
import { orcamentosAprovados, orcamentoLigado } from "@/lib/dre/orcamento/dados";
import { porGrupoOrcado } from "@/lib/dre/orcamento/grade";
import { mesesDoAcumulado } from "@/lib/dre/orcamento/variacao";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { StatusDot } from "@/components/shared/StatusDot";

export const dynamic = "force-dynamic";

const MODULE = "dre_economica";
// Setor que opera o módulo neste tenant (ver `setorDoModulo`); o do catálogo
// é só o padrão.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

// Mês, acumulado e doze meses num seletor ao lado do mês (05/11/2026): eram
// abas, e embaixo das quatro DREs em abas viravam uma segunda fileira.
const VISOES = [
  { chave: "mes", rotulo: "Mês", icone: <CalendarDays size={14} aria-hidden /> },
  { chave: "acumulado", rotulo: "Acumulado no ano", icone: <CalendarRange size={14} aria-hidden /> },
  { chave: "12meses", rotulo: "Últimos 12 meses", icone: <TrendingUp size={14} aria-hidden /> },
] as const;

/**
 * DRE econômica — por competência.
 *
 * A DRE de `/dre` responde "quanto dinheiro andou no mês". Esta responde
 * "quanto resultado o mês gerou", pago ou não. As duas usam a mesma estrutura e
 * o mesmo de-para, então a diferença entre elas é só de **quando** — e essa
 * diferença tem tela própria, na reconciliação.
 *
 * Dois recortes a mais, ambos opcionais:
 *
 * - **centro de custo** — filtra lançamentos e ajustes da cobrança por um
 *   centro (ou "sem centro"), e o quadro "Resultado por centro de custo" mostra
 *   todos lado a lado, somando a DRE sem filtro;
 * - **orçado × realizado** — com o módulo de orçamento ligado e uma versão
 *   aprovada no ano, a DRE ganha as colunas do orçado no mês e no acumulado. Só
 *   sem filtro de centro: o orçamento é da empresa inteira, e comparar o
 *   realizado de um centro com o orçado da empresa daria variação sem sentido.
 */
export default async function DreEconomicaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const visao = VISOES.find((v) => v.chave === params.visao)?.chave ?? "mes";
  // A empresa da URL, a última aberta pela pessoa — ou nenhuma, e a tela pede
  // (13/10/2026); era a primeira em ordem alfabética.
  const empresas = await empresasDoSeletor(ctx.tenantId);
  // Com uma empresa em foco (21/10/2026), só ela, a matriz e as filiais.
  const { escolha, empresa, foco } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const companyId = empresa?.id ?? null;
  // O modelo do DRE da empresa (21/10/2026) e, no padrão, as duas visões dos
  // impostos (20/10/2026): no EBITDA, o padrão; ou fora do resultado.
  const modelo = companyId ? await modeloDaEmpresa(ctx.tenantId, companyId) : undefined;
  const opcoes = opcoesDaUrl(params.impostos, modelo);

  // "DRE", com a aba Competência marcada embaixo (05/11/2026, escolha 6A do
  // Kauan): as quatro DREs são abas de uma tela só.
  const cabecalho = (action?: React.ReactNode) => (
    <PageHeader title="DRE" subtitle="Competência: o mês a que a conta pertence, não o dia em que foi paga." action={action} />
  );
  if (!empresa || !companyId) {
    return (
      <PageContainer>
        {cabecalho()}
        {empresas.length === 0 ? (
          <EmptyState title="Nenhuma empresa ativa" icon={<FileText />} />
        ) : (
          <>
            <FiltroDaEmpresa foco={foco} />
            <EscolhaAEmpresa escolha={escolha} porQue="A DRE econômica é de uma empresa por vez." />
          </>
        )}
      </PageContainer>
    );
  }

  // Todo formulário desta tela grava na empresa escolhida — o rodapé diz qual.
  const comEmpresa = (tela: React.ReactNode) => (
    <EmpresaDaTela empresa={{ nome: empresa.nome, cnpj: empresa.cnpj }}>{tela}</EmpresaDaTela>
  );

  // Sem mês na URL, o mais recente com lançamento — abrir num mês vazio faria
  // a tela parecer quebrada para quem só quer ver o último fechamento.
  const [comMovimento, centros, comOrcamento] = await Promise.all([
    competenciasDaEmpresa(ctx.tenantId, companyId),
    // Inativos também: o filtro é de relatório, e o que foi lançado num centro
    // inativado continua sendo dele.
    getPrisma().costCenter.findMany({
      where: { tenantId: ctx.tenantId, companyId },
      select: { id: true, name: true, code: true, active: true },
      orderBy: { name: "asc" },
    }),
    orcamentoLigado(ctx.tenantId),
  ]);
  const mes = competenciaValida(params.mes) ?? comMovimento[0] ?? competenciaDoInstante(new Date());
  const competencias = visao === "mes" ? [mes] : visao === "acumulado" ? acumuladoDoAno(mes) : competenciasAte(mes, 12);
  const filtro = lerFiltroDeCentro(params.centro, new Set(centros.map((c) => c.id)));
  const centroNaUrl = valorDoFiltroDeCentro(filtro);
  const nomeDoFiltro =
    filtro.tipo === "sem" ? "Sem centro de custo" : filtro.tipo === "centro" ? centros.find((c) => c.id === filtro.id)?.name ?? "" : null;

  // Orçado × realizado: mês e acumulado do ano, então a visão de 12 meses (que
  // atravessa anos) fica de fora.
  const { ano, mes: numeroDoMes } = partesDaCompetencia(mes);
  const querOrcado = comOrcamento && filtro.tipo === "todos" && visao !== "12meses";
  const orcamento = querOrcado ? (await orcamentosAprovados(ctx.tenantId, companyId, [ano])).get(ano) ?? null : null;
  // Com orçado, a série cobre o acumulado do ano mesmo na visão do mês — é o
  // bloco "acumulado" da comparação. Uma consulta só. Na visão do mês, ela
  // leva também o mês anterior, para os números do topo dizerem contra o quê
  // (08/10/2026) — um mês a mais na mesma consulta, não uma consulta nova.
  const mesAnterior = somarMeses(mes, -1);
  const competenciasDaSerie =
    visao === "mes" ? [...new Set([...(orcamento ? acumuladoDoAno(mes) : competencias), mesAnterior])] : competencias;

  // O rascunho do mês também aqui (05/11/2026, decisão D4): mês que só tem
  // lançamento por competência não aparece na DRE de caixa, e sem esta faixa
  // não haveria onde publicá-lo. Só na visão do mês e sem filtro de centro —
  // a publicação é do mês da empresa inteira.
  const comRascunho = visao === "mes" && filtro.tipo === "todos";
  const [serie, quadro, rascunho] = await Promise.all([
    serieEconomica(ctx.tenantId, companyId, competenciasDaSerie, filtro, opcoes),
    centros.length > 0 ? quadroPorCentroDoPeriodo(ctx.tenantId, companyId, competencias, opcoes) : Promise.resolve(null),
    comRascunho
      ? garantirFotoInicial(ctx.tenantId, companyId).then(() =>
          Promise.all([fotoAtualDoMes(ctx.tenantId, companyId, mes), publicacoesDaEmpresa(ctx.tenantId, companyId, [mes])])
        )
      : Promise.resolve(null),
  ]);
  const publicada = rascunho ? (rascunho[1].get(mes) ?? null) : null;
  const diferencas = rascunho ? diferencasDaDre(publicada?.foto ?? null, rascunho[0]) : [];
  const meses = competencias.map((c) => serie.get(c)!);
  const lancamentos = meses.reduce((n, m) => n + m.lancamentos, 0);
  const provisorios = meses.reduce((n, m) => n + m.provisorios, 0);
  const naoClassificado = meses.flatMap((m) => m.resultado.naoClassificado).reduce((n, x) => n + x.centavos, 0);
  // Diferença de acordo e perda com clientes: não são lançamento, mas são
  // resultado do mês — ver src/lib/financeiro/cobranca/dre.ts.
  const cobranca = meses.reduce(
    (t, m) => ({
      acrescimos: t.acrescimos + m.cobranca.acrescimosDeAcordo,
      descontos: t.descontos + m.cobranca.descontosDeAcordo,
      perdas: t.perdas + m.cobranca.perdas,
    }),
    { acrescimos: 0, descontos: 0, perdas: 0 }
  );
  const temCobranca = cobranca.acrescimos !== 0 || cobranca.descontos !== 0 || cobranca.perdas !== 0;
  const resultado = comRotulosEconomicos(
    visao === "mes" ? serie.get(mes)!.resultado : resultadoDePorGrupo(somarPorGrupo(meses.map((m) => m.resultado.porGrupo), modelo), opcoes)
  );
  const imposto = impostoForaDoResultado(resultado, opcoes);
  // Sem lançamento nem ajuste da cobrança no mês anterior, sem comparação.
  const doAnterior = visao === "mes" ? serie.get(mesAnterior) : undefined;
  const anterior =
    doAnterior &&
    (doAnterior.lancamentos > 0 ||
      doAnterior.cobranca.acrescimosDeAcordo !== 0 ||
      doAnterior.cobranca.descontosDeAcordo !== 0 ||
      doAnterior.cobranca.perdas !== 0)
      ? { resultado: doAnterior.resultado, rotulo: rotuloDaCompetencia(mesAnterior) }
      : null;

  const comparacao = orcamento
    ? {
        mes: {
          rotulo: `${rotuloDaCompetencia(mes)} — mês`,
          realizado: comRotulosEconomicos(serie.get(mes)!.resultado),
          orcado: comRotulosEconomicos(resultadoDePorGrupo(porGrupoOrcado(orcamento.grade, [numeroDoMes], orcamento.modelo), opcoes)),
        },
        acumulado: {
          rotulo: `Acumulado jan a ${rotuloDaCompetencia(mes)}`,
          realizado: comRotulosEconomicos(
            resultadoDePorGrupo(
              somarPorGrupo(
                acumuladoDoAno(mes).map((c) => serie.get(c)!.resultado.porGrupo),
                modelo
              ),
              opcoes
            )
          ),
          orcado: comRotulosEconomicos(
            resultadoDePorGrupo(porGrupoOrcado(orcamento.grade, mesesDoAcumulado(numeroDoMes), orcamento.modelo), opcoes)
          ),
        },
      }
    : null;

  const comCentro = centroNaUrl ? `&centro=${centroNaUrl}` : "";
  const base = `/dre/economica?empresa=${companyId}&mes=${mes}`;
  const hrefDaVisao = (chave: string) => `${base}${chave === "mes" ? "" : `&visao=${chave}`}${comCentro}${sufixoDosImpostos(opcoes)}`;
  const periodo =
    visao === "mes"
      ? rotuloDaCompetencia(mes)
      : `${rotuloDaCompetencia(competencias[0]!)} a ${rotuloDaCompetencia(competencias.at(-1)!)}`;

  // A visão dos impostos no "⋯" do cabeçalho, como na DRE de caixa (05/11/2026):
  // era um seletor de dois segmentos na fileira dos filtros.
  const impostos =
    modelo?.impostos === "escolha"
      ? trocaDosImpostos(opcoes, "/dre/economica", {
          empresa: companyId,
          mes,
          visao: visao === "mes" ? undefined : visao,
          centro: centroNaUrl || undefined,
        })
      : null;
  // O vazio leva ao último mês com lançamentos (05/11/2026): dizia só "nenhum
  // lançamento", e quem abria no mês corrente não sabia para onde ir.
  const ultimoComMovimento = comMovimento[0] && !competencias.includes(comMovimento[0]) ? comMovimento[0] : null;

  return comEmpresa(
    <PageContainer>
      {cabecalho(
        impostos ? (
          <MenuDeMaisAcoes rotulo="Mais ações da DRE" size="md" width={280} sempreMenu>
            <ItemDoMenu href={impostos.href} icone={<Percent />}>
              {impostos.rotulo}
            </ItemDoMenu>
          </MenuDeMaisAcoes>
        ) : undefined
      )}
      <AbasDaDre ativa="competencia" companyId={companyId} mes={mes} />
      {/* O mês e o centro de custo seguem no formulário com "Aplicar"; a
          visão, no seletor ao lado. O centro é da empresa — trocar de empresa
          o deixa para trás. */}
      <FiltroDaEmpresa foco={foco}>
        <FiltroDePeriodo
          acao="/dre/economica"
          mes={mes}
          mesEmNumero
          extras={{ empresa: companyId, visao: visao === "mes" ? undefined : visao, impostos: opcoes.impostosNoEbitda ? undefined : "fora" }}
          naFileira
        >
          {centros.length > 0 && (
            <Select compact name="centro" defaultValue={centroNaUrl} className="w-60 max-w-full" aria-label="Centro de custo">
              <option value="">Todos os centros de custo</option>
              <option value={SEM_CENTRO}>Sem centro de custo</option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : " (inativo)"}
                </option>
              ))}
            </Select>
          )}
        </FiltroDePeriodo>
        <SegmentedControl
          label="Período do relatório"
          active={visao}
          items={VISOES.map((v) => ({ key: v.chave, label: v.rotulo, icon: v.icone, href: hrefDaVisao(v.chave) }))}
        />
      </FiltroDaEmpresa>

      {diferencas.length > 0 && (
        <FaixaDoRascunho
          companyId={companyId}
          competencia={mes}
          rotuloDoMes={rotuloDaCompetencia(mes)}
          diferencas={diferencas}
          nuncaPublicado={!publicada}
        />
      )}

      {/* Revisão de 05/10: botão não é link — os atalhos desta tela eram texto azul. */}
      {nomeDoFiltro && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-fs-2 text-fg-secondary mb-3">
          <p>
            Filtrado pelo centro de custo <strong>{nomeDoFiltro}</strong> — lançamentos, acordos e perdas dele.
            {comOrcamento && " Orçado × realizado só aparece sem filtro de centro, porque o orçamento é da empresa inteira."}
          </p>
          <Button href={`${base}${visao === "mes" ? "" : `&visao=${visao}`}`} variant="secondary" size="xs">
            Ver a empresa inteira
          </Button>
        </div>
      )}

      {lancamentos === 0 && !temCobranca && !comparacao ? (
        // Em cartão, como o vazio das listas (08/10/2026): solto, flutuava no fundo.
        <Card>
          <EmptyState
            title={`Nada com competência em ${periodo}${nomeDoFiltro ? ` em ${nomeDoFiltro}` : ""}`}
            description={
              nomeDoFiltro
                ? "Nenhum lançamento deste centro de custo no período."
                : ultimoComMovimento
                  ? `O último mês com lançamentos é ${rotuloDaCompetencia(ultimoComMovimento)}.`
                  : "Esta empresa ainda não tem lançamentos com competência. Contas lançadas por nota ou à mão aparecem aqui no mês a que pertencem."
            }
            action={
              !nomeDoFiltro && ultimoComMovimento ? (
                <Button
                  href={`/dre/economica?empresa=${companyId}&mes=${ultimoComMovimento}${visao === "mes" ? "" : `&visao=${visao}`}${sufixoDosImpostos(opcoes)}`}
                  variant="primary"
                  size="sm"
                >
                  Ver {rotuloDaCompetencia(ultimoComMovimento)}
                </Button>
              ) : undefined
            }
            icon={<FileText />}
          />
        </Card>
      ) : (
        <>
          {/* Os números do topo no padrão novo (08/10/2026, escolha 9A do
              Kauan): a margem com o percentual no detalhe, e não colado no
              valor, onde cortava; os resultados sem o verde do sinal; e, na
              visão do mês, a comparação com o mês anterior. */}
          <NumerosDaDre resultado={resultado} regime="competencia" anterior={anterior} />

          {/* Provisório entra no resultado — a obrigação existe —, mas é o
              pedaço do número que ninguém conferiu. Dizer quantos são é o que
              separa "resultado" de "resultado a confirmar". */}
          {/* O `Aviso` do app (08/10/2026), com o texto em `fg`: são frases
              longas, e o âmbar como cor de texto fica abaixo do contraste AA. */}
          {(provisorios > 0 || naoClassificado !== 0 || imposto !== 0) && (
            <Aviso tom="atencao" className="mb-4">
              <ul className="flex flex-col gap-1.5 text-fg">
                {provisorios > 0 && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning-fg" />
                    <span>
                      <strong>{provisorios}</strong> {provisorios === 1 ? "lançamento ainda a conferir entra" : "lançamentos ainda a conferir entram"} neste resultado.
                    </span>
                  </li>
                )}
                {naoClassificado !== 0 && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning-fg" />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      <span>
                        <strong>{moeda(Math.abs(naoClassificado))}</strong> sem grupo no DRE e fora do resultado. O de-para é o
                        mesmo da DRE de caixa.
                      </span>
                      <Button href={`/dre?empresa=${companyId}`} variant="secondary" size="xs">
                        Classificar na DRE
                      </Button>
                    </div>
                  </li>
                )}
                {imposto !== 0 && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning-fg" />
                    <span>
                      <strong>{moeda(Math.abs(imposto))}</strong> de impostos sobre a receita não entram no resultado —{" "}
                      {modelo?.impostos === "fora"
                        ? `a margem parte da Receita Bruta, como na planilha do modelo “${modelo.nome}”.`
                        : "é a visão “Impostos fora do resultado”."}
                    </span>
                  </li>
                )}
              </ul>
            </Aviso>
          )}

          {temCobranca && (
            <Card className="p-4 mb-4">
              <p className="text-ui text-fg">
                Da cobrança neste período:
                {cobranca.acrescimos !== 0 && <> acréscimos de acordo <strong className="tabular-nums">{moeda(cobranca.acrescimos)}</strong> em outras receitas;</>}
                {cobranca.descontos !== 0 && <> descontos de acordo <strong className="tabular-nums">{moeda(Math.abs(cobranca.descontos))}</strong> em outras despesas;</>}
                {cobranca.perdas !== 0 && <> perdas com clientes <strong className="tabular-nums">{moeda(Math.abs(cobranca.perdas))}</strong> em outras despesas.</>}
              </p>
              <p className="text-micro text-fg-muted mt-1">
                Título renegociado ou perdido continua como receita na competência dele; parcela de acordo não é receita, é recebimento.
                {centros.length > 0 && " A perda segue o centro do título; a diferença de acordo, o centro comum dos títulos renegociados."}
              </p>
            </Card>
          )}

          {comparacao && orcamento ? (
            <>
              <RelatorioOrcadoRealizado mes={comparacao.mes} acumulado={comparacao.acumulado} />
              <NotaDeFonte>
                Orçado da versão aprovada <strong>{orcamento.nome}</strong> de {ano}. Var. R$ é realizado − orçado na convenção
                da DRE (despesa negativa); verde é melhor que o orçado — receita acima ou despesa abaixo —, vermelho é pior. Sem
                orçado na linha, a variação % fica em branco.
              </NotaDeFonte>
            </>
          ) : (
            <RelatorioDoDre resultado={resultado} />
          )}
        </>
      )}

      {/* O aviso "sem orçamento aprovado" saiu daqui (05/11/2026, escolha 6A
          do Kauan): mora na aba Orçado × realizado. Aqui, só na explicação. */}

      {/* O quadro na tabela padrão (15/10/2026): era uma lista com o cabeçalho
          cinza escrito à mão e os valores encostados à direita. Centro inativo
          leva a bolinha, e não "(inativo)" no texto. */}
      {quadro && (
        <section className="mt-5">
          <h2 className="text-card-title font-semibold text-fg">Resultado por centro de custo — {periodo}</h2>
          <p className="text-micro text-fg-muted mt-0.5 mb-2">
            A conta rateada entra em cada centro pela parte dela: as linhas somam a DRE da empresa sem filtro. Despesas somam
            todos os grupos de pagamento; o resultado segue a estrutura da DRE, na visão de impostos escolhida.
          </p>
          <div className="c41-tabela scroll-x overflow-x-auto bg-surface border border-border rounded-lg">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr>
                  <th className="px-3">Centro de custo</th>
                  <th className="px-3">Receita bruta</th>
                  <th className="px-3">Despesas</th>
                  <th className="px-3">Resultado do período</th>
                </tr>
              </thead>
              <tbody>
                {quadro.linhas.map((l) => {
                  const valorDoCentro = l.centroId ?? SEM_CENTRO;
                  const ativo = centroNaUrl === valorDoCentro;
                  return (
                    <tr key={valorDoCentro} className={`border-b border-border-soft ${ativo ? "bg-brand/8" : ""}`}>
                      <td className="px-3">
                        <Link
                          href={`${base}${visao === "mes" ? "" : `&visao=${visao}`}&centro=${valorDoCentro}`}
                          className={`hover:underline ${l.centroId === null ? "text-fg-secondary italic" : "text-fg"}`}
                        >
                          {l.nome}
                        </Link>
                        {l.codigo && <span className="text-micro text-fg-muted"> · {l.codigo}</span>}
                        {!l.ativo && <StatusDot color="var(--c41-fg-muted)" label="Inativo" className="ml-2 align-middle" />}
                      </td>
                      <td className={`px-3 tabular-nums ${tomDoValor(l.receitaBruta)}`}>{moeda(l.receitaBruta)}</td>
                      <td className={`px-3 tabular-nums ${tomDoValor(l.despesas)}`}>{moeda(l.despesas)}</td>
                      <td className={`px-3 tabular-nums font-medium ${tomDoValor(l.resultado)}`}>{moeda(l.resultado)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-surface-2 font-semibold">
                  <td className="px-3">Total da empresa</td>
                  <td className={`px-3 tabular-nums ${tomDoValor(quadro.total.receitaBruta)}`}>{moeda(quadro.total.receitaBruta)}</td>
                  <td className={`px-3 tabular-nums ${tomDoValor(quadro.total.despesas)}`}>{moeda(quadro.total.despesas)}</td>
                  <td className={`px-3 tabular-nums ${tomDoValor(quadro.total.resultado)}`}>{moeda(quadro.total.resultado)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ComoEstaDreEMontada
        lancamentos={lancamentos}
        periodo={periodo}
        nomeDoFiltro={nomeDoFiltro}
        orcamento={
          !comOrcamento
            ? null
            : filtro.tipo !== "todos"
              ? "centro"
              : visao === "12meses"
                ? "doze-meses"
                : orcamento
                  ? "aprovado"
                  : "sem-aprovado"
        }
        ano={ano}
      />
    </PageContainer>
  );
}

/**
 * O rodapé da DRE econômica numa linha que recolhe (05/11/2026, escolha 6A do
 * Kauan), fechada como todo recolhível do app: era um parágrafo técnico, o
 * aviso do orçamento e dois botões soltos ("Abrir DRE de caixa", "Ver
 * reconciliação"), que viraram as abas do alto.
 */
function ComoEstaDreEMontada({
  lancamentos,
  periodo,
  nomeDoFiltro,
  orcamento,
  ano,
}: {
  lancamentos: number;
  periodo: string;
  nomeDoFiltro: string | null;
  /** O que dizer do orçado × realizado; `null` sem o módulo de orçamento. */
  orcamento: "aprovado" | "sem-aprovado" | "centro" | "doze-meses" | null;
  ano: number;
}) {
  return (
    <Accordion
      className="mt-5 border-t border-border pt-3"
      classeDoCabecalho="w-full text-fs-2 text-fg-secondary hover:text-fg"
      classeDoConteudo="pt-2 pl-5"
      titulo={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">Como esta DRE é montada</span>
          <span className="text-fg-muted">
            {lancamentos} {lancamentos === 1 ? "lançamento" : "lançamentos"} com competência em {periodo}
            {nomeDoFiltro ? ` (${nomeDoFiltro})` : ""}
          </span>
        </span>
      }
    >
      <ul className="flex flex-col gap-1.5 text-helper text-fg-secondary list-disc pl-4 max-w-[75ch]">
        <li>
          Regime de <strong className="text-fg">competência</strong>: entra o que pertence ao mês, pago ou não. O que foi
          pago ou recebido está na aba Caixa, e a diferença entre os dois regimes, na aba Análises e reconciliação.
        </li>
        <li>Cancelados e parcelas de acordo ficam fora: parcela de acordo é recebimento, não receita.</li>
        <li>O import do Omie não entra aqui: é um export de pagamentos, sem competência.</li>
        {orcamento === "aprovado" && <li>As colunas do orçado vêm da versão aprovada de {ano}, na aba Orçado × realizado.</li>}
        {orcamento === "sem-aprovado" && (
          <li>{ano} ainda não tem orçamento aprovado. Com uma versão aprovada na aba Orçado × realizado, esta DRE ganha as colunas do orçado.</li>
        )}
        {orcamento === "doze-meses" && <li>O orçado × realizado aparece nas visões Mês e Acumulado no ano.</li>}
        {orcamento === "centro" && <li>O orçado × realizado só aparece sem filtro de centro: o orçamento é da empresa inteira.</li>}
      </ul>
    </Accordion>
  );
}
