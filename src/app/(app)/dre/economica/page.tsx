import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, FileText } from "lucide-react";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getPrisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { RelatorioOrcadoRealizado } from "@/components/dre/RelatorioOrcadoRealizado";
import { NumerosDaDre } from "@/components/dre/NumerosDaDre";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
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
import { SeletorDosImpostos, sufixoDosImpostos } from "@/components/dre/SeletorDosImpostos";
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

const VISOES = [
  { chave: "mes", rotulo: "Mês" },
  { chave: "acumulado", rotulo: "Acumulado no ano" },
  { chave: "12meses", rotulo: "Últimos 12 meses" },
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
  if (!ctx.tenantId || !canViewSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const visao = VISOES.find((v) => v.chave === params.visao)?.chave ?? "mes";
  // A empresa da URL, a última aberta pela pessoa — ou nenhuma, e a tela pede
  // (13/10/2026); era a primeira em ordem alfabética.
  const empresas = await empresasDoSeletor(ctx.tenantId);
  // Com uma empresa em foco (21/10/2026), só ela, a matriz e as filiais.
  const { escolha, empresa, noSeletor, foco } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const companyId = empresa?.id ?? null;
  // O modelo do DRE da empresa (21/10/2026) e, no padrão, as duas visões dos
  // impostos (20/10/2026): no EBITDA, o padrão; ou fora do resultado.
  const modelo = companyId ? await modeloDaEmpresa(ctx.tenantId, companyId) : undefined;
  const opcoes = opcoesDaUrl(params.impostos, modelo);

  const cabecalho = (
    <PageHeader title="DRE econômica" subtitle="Demonstrativo de resultado por competência — o que pertence ao mês, pago ou não." />
  );
  if (!empresa || !companyId) {
    return (
      <PageContainer>
        {cabecalho}
        {empresas.length === 0 ? (
          <EmptyState title="Nenhuma empresa ativa" icon={<FileText />} />
        ) : (
          <>
            <FiltroDaEmpresa
              acao="/dre/economica"
              empresas={noSeletor}
              foco={foco}
              valor={null}
              manter={{ mes: params.mes, visao: visao === "mes" ? undefined : visao }}
            />
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

  const [serie, quadro] = await Promise.all([
    serieEconomica(ctx.tenantId, companyId, competenciasDaSerie, filtro, opcoes),
    centros.length > 0 ? quadroPorCentroDoPeriodo(ctx.tenantId, companyId, competencias, opcoes) : Promise.resolve(null),
  ]);
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

  return comEmpresa(
    <PageContainer>
      {cabecalho}
      {/* A empresa navega sozinha (e vira a última aberta); mês e centro de
          custo seguem no formulário com "Aplicar". Trocar de empresa conserva
          o mês e a visão — o centro é da empresa anterior e fica para trás. */}
      <FiltroDaEmpresa
        acao="/dre/economica"
        empresas={noSeletor}
        foco={foco}
        valor={companyId}
        manter={{ mes, visao: visao === "mes" ? undefined : visao, impostos: opcoes.impostosNoEbitda ? undefined : "fora" }}
      >
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
        {modelo?.impostos === "escolha" && (
          <SeletorDosImpostos
            opcoes={opcoes}
            base="/dre/economica"
            params={{ empresa: companyId, mes, visao: visao === "mes" ? undefined : visao, centro: centroNaUrl || undefined }}
          />
        )}
      </FiltroDaEmpresa>
      <AbasDeLink abas={VISOES.map((v) => ({ ...v, href: hrefDaVisao(v.chave) }))} ativa={visao} />

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
            title={`Nenhum lançamento com competência em ${periodo}${nomeDoFiltro ? ` em ${nomeDoFiltro}` : ""}`}
            description="A DRE econômica soma os lançamentos pela competência. Contas lançadas por nota ou à mão aparecem aqui no mês a que pertencem."
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
              <Button href={`/dre/orcamento?empresa=${companyId}&ano=${ano}`} variant="secondary" size="xs" className="mt-2">
                Abrir orçamento
              </Button>
            </>
          ) : (
            <RelatorioDoDre resultado={resultado} />
          )}
        </>
      )}

      {/* Sem versão aprovada, um aviso discreto em vez de a comparação sumir sem explicação. */}
      {querOrcado && !orcamento && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-fs-2 text-fg-muted mt-3">
          <p>Sem orçamento aprovado para {ano} — o orçado × realizado aparece aqui quando houver.</p>
          <Button href={`/dre/orcamento?empresa=${companyId}&ano=${ano}`} variant="secondary" size="xs">
            Abrir orçamento
          </Button>
        </div>
      )}
      {comOrcamento && filtro.tipo === "todos" && visao === "12meses" && (
        <p className="text-helper text-fg-muted mt-3">Orçado × realizado nas visões Mês e Acumulado no ano.</p>
      )}

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

      <NotaDeFonte>
        {lancamentos} {lancamentos === 1 ? "lançamento" : "lançamentos"} com competência em {periodo}
        {nomeDoFiltro ? ` (${nomeDoFiltro})` : ""}, cancelados e parcelas de acordo fora.
        {" "}Regime de <strong>competência</strong>: o que foi pago ou recebido está na DRE de caixa. O import do Omie
        não entra aqui — é export de pagamentos, sem competência. A diferença entre os dois regimes está na reconciliação.
      </NotaDeFonte>
      <div className="flex flex-wrap items-center gap-2 mt-1.5">
        <Button href={`/dre?empresa=${companyId}`} variant="ghost" size="xs">
          Abrir DRE de caixa
        </Button>
        <Button href={`/dre/analises?empresa=${companyId}&mes=${mes}&aba=reconciliacao`} variant="ghost" size="xs">
          Ver reconciliação
        </Button>
      </div>
    </PageContainer>
  );
}
