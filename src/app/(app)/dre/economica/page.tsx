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
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { RelatorioOrcadoRealizado } from "@/components/dre/RelatorioOrcadoRealizado";
import { FiltroDePeriodo, AbasDeLink, FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import {
  competenciaValida,
  competenciasAte,
  acumuladoDoAno,
  rotuloDaCompetencia,
  competenciaDoInstante,
  partesDaCompetencia,
} from "@/lib/financeiro/periodo";
import { serieEconomica, competenciasDaEmpresa, quadroPorCentroDoPeriodo } from "@/lib/dre/dataEconomica";
import { comRotulosEconomicos, valorDaLinha, fracaoDaLinha, LINHA_DE_RESULTADO, LINHA_OPERACIONAL } from "@/lib/dre/economica";
import { resultadoDePorGrupo, somarPorGrupo } from "@/lib/dre/analises";
import { impostoForaDoResultado } from "@/lib/dre/calculo";
import { moeda, percentual, tomDoValor } from "@/lib/financeiro/formato";
import { lerFiltroDeCentro, valorDoFiltroDeCentro, SEM_CENTRO } from "@/lib/financeiro/centroDeCusto";
import { orcamentosAprovados, orcamentoLigado } from "@/lib/dre/orcamento/dados";
import { porGrupoOrcado } from "@/lib/dre/orcamento/grade";
import { mesesDoAcumulado } from "@/lib/dre/orcamento/variacao";

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
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const companyId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : empresas[0]?.id;

  const cabecalho = (
    <PageHeader title="DRE econômica" subtitle="Demonstrativo de resultado por competência — o que pertence ao mês, pago ou não." />
  );
  if (!companyId) {
    return (
      <PageContainer variant="narrow">
        {cabecalho}
        <EmptyState title="Nenhuma empresa ativa" icon={<FileText />} />
      </PageContainer>
    );
  }

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
  // bloco "acumulado" da comparação. Uma consulta só.
  const competenciasDaSerie = orcamento && visao === "mes" ? acumuladoDoAno(mes) : competencias;

  const [serie, quadro] = await Promise.all([
    serieEconomica(ctx.tenantId, companyId, competenciasDaSerie, filtro),
    centros.length > 0 ? quadroPorCentroDoPeriodo(ctx.tenantId, companyId, competencias) : Promise.resolve(null),
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
    visao === "mes" ? serie.get(mes)!.resultado : resultadoDePorGrupo(somarPorGrupo(meses.map((m) => m.resultado.porGrupo)))
  );
  const imposto = impostoForaDoResultado(resultado);

  const comparacao = orcamento
    ? {
        mes: {
          rotulo: `${rotuloDaCompetencia(mes)} — mês`,
          realizado: comRotulosEconomicos(serie.get(mes)!.resultado),
          orcado: comRotulosEconomicos(resultadoDePorGrupo(porGrupoOrcado(orcamento.grade, [numeroDoMes]))),
        },
        acumulado: {
          rotulo: `Acumulado jan a ${rotuloDaCompetencia(mes)}`,
          realizado: comRotulosEconomicos(
            resultadoDePorGrupo(somarPorGrupo(acumuladoDoAno(mes).map((c) => serie.get(c)!.resultado.porGrupo)))
          ),
          orcado: comRotulosEconomicos(resultadoDePorGrupo(porGrupoOrcado(orcamento.grade, mesesDoAcumulado(numeroDoMes)))),
        },
      }
    : null;

  const comCentro = centroNaUrl ? `&centro=${centroNaUrl}` : "";
  const base = `/dre/economica?empresa=${companyId}&mes=${mes}`;
  const hrefDaVisao = (chave: string) => `${base}${chave === "mes" ? "" : `&visao=${chave}`}${comCentro}`;
  const periodo =
    visao === "mes"
      ? rotuloDaCompetencia(mes)
      : `${rotuloDaCompetencia(competencias[0]!)} a ${rotuloDaCompetencia(competencias.at(-1)!)}`;

  return (
    <PageContainer variant={comparacao ? "wide" : "narrow"}>
      {cabecalho}
      <FiltroDePeriodo acao="/dre/economica" empresas={empresas} empresaId={companyId} mes={mes} extras={{ visao: visao === "mes" ? undefined : visao }}>
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
      <AbasDeLink abas={VISOES.map((v) => ({ ...v, href: hrefDaVisao(v.chave) }))} ativa={visao} />

      {nomeDoFiltro && (
        <p className="text-[12px] text-fg-secondary mb-3">
          Filtrado pelo centro de custo <strong>{nomeDoFiltro}</strong> — lançamentos, acordos e perdas dele.{" "}
          <Link href={`${base}${visao === "mes" ? "" : `&visao=${visao}`}`} className="text-brand hover:underline">
            Ver a empresa inteira
          </Link>
          {comOrcamento && " · orçado × realizado só aparece sem filtro de centro, porque o orçamento é da empresa inteira."}
        </p>
      )}

      {lancamentos === 0 && !temCobranca && !comparacao ? (
        <EmptyState
          title={`Nenhum lançamento com competência em ${periodo}${nomeDoFiltro ? ` em ${nomeDoFiltro}` : ""}`}
          description="A DRE econômica soma os lançamentos pela competência. Contas lançadas por nota ou à mão aparecem aqui no mês a que pertencem."
          icon={<FileText />}
        />
      ) : (
        <>
          <FaixaDeTotais
            itens={[
              { rotulo: "Receita bruta", valor: moeda(valorDaLinha(resultado, "receita_bruta")) },
              {
                rotulo: "Margem de contribuição",
                valor: `${moeda(valorDaLinha(resultado, "margem_contribuicao"))} · ${percentual(fracaoDaLinha(resultado, "margem_contribuicao_pct"))}`,
              },
              { rotulo: "Resultado operacional", valor: moeda(valorDaLinha(resultado, LINHA_OPERACIONAL)), tom: tomDoValor(valorDaLinha(resultado, LINHA_OPERACIONAL)) },
              { rotulo: "Resultado do período", valor: moeda(valorDaLinha(resultado, LINHA_DE_RESULTADO)), tom: tomDoValor(valorDaLinha(resultado, LINHA_DE_RESULTADO)) },
            ]}
          />

          {/* Provisório entra no resultado — a obrigação existe —, mas é o
              pedaço do número que ninguém conferiu. Dizer quantos são é o que
              separa "resultado" de "resultado a confirmar". */}
          {(provisorios > 0 || naoClassificado !== 0 || imposto !== 0) && (
            <Card className="p-4 mb-4 border-warning/40 bg-warning-bg">
              <ul className="flex flex-col gap-1.5 text-[13px] text-fg">
                {provisorios > 0 && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
                    <span>
                      <strong>{provisorios}</strong> {provisorios === 1 ? "lançamento ainda a conferir entra" : "lançamentos ainda a conferir entram"} neste resultado.
                    </span>
                  </li>
                )}
                {naoClassificado !== 0 && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
                    <span>
                      <strong>{moeda(Math.abs(naoClassificado))}</strong> sem grupo no DRE e fora do resultado. O de-para é o
                      mesmo da DRE de caixa — classifique em <Link href={`/dre?empresa=${companyId}`} className="text-brand hover:underline">DRE</Link>.
                    </span>
                  </li>
                )}
                {imposto !== 0 && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
                    <span>
                      <strong>{moeda(Math.abs(imposto))}</strong> de impostos sobre a receita não entram no resultado — a margem parte da
                      Receita Bruta, a mesma regra da DRE de caixa.
                    </span>
                  </li>
                )}
              </ul>
            </Card>
          )}

          {temCobranca && (
            <Card className="p-4 mb-4">
              <p className="text-[13px] text-fg">
                Da cobrança neste período:
                {cobranca.acrescimos !== 0 && <> acréscimos de acordo <strong className="tabular-nums">{moeda(cobranca.acrescimos)}</strong> em outras receitas;</>}
                {cobranca.descontos !== 0 && <> descontos de acordo <strong className="tabular-nums">{moeda(Math.abs(cobranca.descontos))}</strong> em outras despesas;</>}
                {cobranca.perdas !== 0 && <> perdas com clientes <strong className="tabular-nums">{moeda(Math.abs(cobranca.perdas))}</strong> em outras despesas.</>}
              </p>
              <p className="text-[11px] text-fg-muted mt-1">
                Título renegociado ou perdido continua como receita na competência dele; parcela de acordo não é receita, é recebimento.
                {centros.length > 0 && " A perda segue o centro do título; a diferença de acordo, o centro comum dos títulos renegociados."}
              </p>
            </Card>
          )}

          {comparacao && orcamento ? (
            <>
              <RelatorioOrcadoRealizado mes={comparacao.mes} acumulado={comparacao.acumulado} />
              <p className="text-[11px] text-fg-muted mt-2">
                Orçado da versão aprovada <strong>{orcamento.nome}</strong> de {ano} (
                <Link href={`/dre/orcamento?empresa=${companyId}&ano=${ano}`} className="text-brand hover:underline">
                  ver orçamento
                </Link>
                ). Var. R$ é realizado − orçado na convenção da DRE (despesa negativa); verde é melhor que o orçado — receita
                acima ou despesa abaixo —, vermelho é pior. Sem orçado na linha, a variação % fica em branco.
              </p>
            </>
          ) : (
            <RelatorioDoDre resultado={resultado} />
          )}
        </>
      )}

      {/* Sem versão aprovada, um aviso discreto em vez de a comparação sumir sem explicação. */}
      {querOrcado && !orcamento && (
        <p className="text-[12px] text-fg-muted mt-3">
          Sem orçamento aprovado para {ano} — o orçado × realizado aparece aqui quando houver.{" "}
          <Link href={`/dre/orcamento?empresa=${companyId}&ano=${ano}`} className="text-brand hover:underline">
            Abrir orçamento
          </Link>
        </p>
      )}
      {comOrcamento && filtro.tipo === "todos" && visao === "12meses" && (
        <p className="text-[12px] text-fg-muted mt-3">Orçado × realizado nas visões Mês e Acumulado no ano.</p>
      )}

      {quadro && (
        <Card className="p-0 overflow-hidden mt-5">
          <div className="px-4 pt-3 pb-2">
            <h2 className="text-[14px] font-semibold text-fg">Resultado por centro de custo — {periodo}</h2>
            <p className="text-[11px] text-fg-muted mt-0.5">
              Um centro por lançamento, sem rateio: as linhas somam a DRE da empresa sem filtro. Despesas somam todos os grupos de
              pagamento; o resultado segue a estrutura da DRE (impostos sobre a receita ficam fora dele).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-y border-border">
                  <th className="py-2 pl-4 pr-3 font-medium">Centro de custo</th>
                  <th className="py-2 pr-3 font-medium text-right">Receita bruta</th>
                  <th className="py-2 pr-3 font-medium text-right">Despesas</th>
                  <th className="py-2 pr-4 font-medium text-right">Resultado do período</th>
                </tr>
              </thead>
              <tbody>
                {quadro.linhas.map((l) => {
                  const valorDoCentro = l.centroId ?? SEM_CENTRO;
                  const ativo = centroNaUrl === valorDoCentro;
                  return (
                    <tr key={valorDoCentro} className={`border-b border-border-soft ${ativo ? "bg-brand/8" : ""}`}>
                      <td className="py-2 pl-4 pr-3">
                        <Link
                          href={`${base}${visao === "mes" ? "" : `&visao=${visao}`}&centro=${valorDoCentro}`}
                          className={`hover:underline ${l.centroId === null ? "text-fg-secondary italic" : "text-fg"}`}
                        >
                          {l.nome}
                        </Link>
                        {l.codigo && <span className="text-[11px] text-fg-muted"> · {l.codigo}</span>}
                        {!l.ativo && <span className="text-[11px] text-fg-muted"> (inativo)</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{moeda(l.receitaBruta)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${l.despesas < 0 ? "text-danger" : ""}`}>{moeda(l.despesas)}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums font-medium ${tomDoValor(l.resultado)}`}>{moeda(l.resultado)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-surface-hover font-semibold">
                  <td className="py-2 pl-4 pr-3">Total da empresa</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(quadro.total.receitaBruta)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${quadro.total.despesas < 0 ? "text-danger" : ""}`}>{moeda(quadro.total.despesas)}</td>
                  <td className={`py-2 pr-4 text-right tabular-nums ${tomDoValor(quadro.total.resultado)}`}>{moeda(quadro.total.resultado)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-[11px] text-fg-muted mt-3">
        {lancamentos} {lancamentos === 1 ? "lançamento" : "lançamentos"} com competência em {periodo}
        {nomeDoFiltro ? ` (${nomeDoFiltro})` : ""}, cancelados e parcelas de acordo fora.
        {" "}Regime de <strong>competência</strong>: o que foi pago ou recebido está em{" "}
        <Link href={`/dre?empresa=${companyId}`} className="text-brand hover:underline">DRE (caixa)</Link>. O import do Omie
        não entra aqui — é export de pagamentos, sem competência. A diferença entre os dois regimes está em{" "}
        <Link href={`/dre/analises?empresa=${companyId}&mes=${mes}&aba=reconciliacao`} className="text-brand hover:underline">
          reconciliação
        </Link>
        .
      </p>
    </PageContainer>
  );
}
