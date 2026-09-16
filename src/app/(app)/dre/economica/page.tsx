import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, FileText } from "lucide-react";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { FiltroDePeriodo, AbasDeLink, FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { competenciaValida, competenciasAte, acumuladoDoAno, rotuloDaCompetencia, competenciaDoInstante } from "@/lib/financeiro/periodo";
import { serieEconomica, competenciasDaEmpresa } from "@/lib/dre/dataEconomica";
import { comRotulosEconomicos, valorDaLinha, fracaoDaLinha, LINHA_DE_RESULTADO, LINHA_OPERACIONAL } from "@/lib/dre/economica";
import { resultadoDePorGrupo, somarPorGrupo } from "@/lib/dre/analises";
import { impostoForaDoResultado } from "@/lib/dre/calculo";
import { moeda, percentual, tomDoValor } from "@/lib/financeiro/formato";

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
  const comMovimento = await competenciasDaEmpresa(ctx.tenantId, companyId);
  const mes = competenciaValida(params.mes) ?? comMovimento[0] ?? competenciaDoInstante(new Date());
  const competencias = visao === "mes" ? [mes] : visao === "acumulado" ? acumuladoDoAno(mes) : competenciasAte(mes, 12);

  const serie = await serieEconomica(ctx.tenantId, companyId, competencias);
  const meses = [...serie.values()];
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

  const base = `/dre/economica?empresa=${companyId}&mes=${mes}`;
  const periodo =
    visao === "mes"
      ? rotuloDaCompetencia(mes)
      : `${rotuloDaCompetencia(competencias[0]!)} a ${rotuloDaCompetencia(competencias.at(-1)!)}`;

  return (
    <PageContainer variant="narrow">
      {cabecalho}
      <FiltroDePeriodo acao="/dre/economica" empresas={empresas} empresaId={companyId} mes={mes} extras={{ visao: visao === "mes" ? undefined : visao }} />
      <AbasDeLink
        abas={VISOES.map((v) => ({ ...v, href: v.chave === "mes" ? base : `${base}&visao=${v.chave}` }))}
        ativa={visao}
      />

      {lancamentos === 0 && !temCobranca ? (
        <EmptyState
          title={`Nenhum lançamento com competência em ${periodo}`}
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
              </p>
            </Card>
          )}

          <RelatorioDoDre resultado={resultado} />
        </>
      )}

      <p className="text-[11px] text-fg-muted mt-3">
        {lancamentos} {lancamentos === 1 ? "lançamento" : "lançamentos"} com competência em {periodo}, cancelados e parcelas de acordo fora.
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
