import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { NumerosDaDre } from "@/components/dre/NumerosDaDre";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { dreDoMes, mesesComMovimento } from "@/lib/dre/data";
import { serieEconomica } from "@/lib/dre/dataEconomica";
import { comRotulosEconomicos } from "@/lib/dre/economica";
import {
  competenciaValida,
  competenciaDe,
  partesDaCompetencia,
  rotuloDaCompetencia,
  somarMeses,
} from "@/lib/financeiro/periodo";
import { formatarCompetencia } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * A DRE que o cliente recebe, dentro do portal.
 *
 * O padrão é a de **caixa** — a mesma de `/dre`, inclusive o import do Omie
 * quando o mês foi importado —, porque é o relatório que o BPO entrega hoje. A
 * de competência aparece como segunda aba só quando o tenant ligou o módulo.
 * Sem fila de classificação e sem import: classificar é trabalho da equipe.
 */
export default async function PortalDrePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_dre")) notFound();

  const params = await searchParams;
  const competenciaLiberada = modulos.has("dre_economica");
  const regime = params.regime === "competencia" && competenciaLiberada ? "competencia" : "caixa";

  const empresas = await empresasDoSeletor(escopo.tenantId, escopo.companyIds ?? []);
  const companyId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : empresas[0]?.id;

  const cabecalho = (
    <PortalCabecalho titulo="DRE" descricao="Demonstrativo de resultado por empresa e mês." />
  );
  if (!companyId) {
    return (
      <PageContainer>
        {cabecalho}
        <Card>
          <EmptyState icon={<FileText />} title="Nenhuma empresa vinculada" />
        </Card>
      </PageContainer>
    );
  }

  const meses = await mesesComMovimento(escopo.tenantId, companyId);
  const recente = meses[0] ? competenciaDe(meses[0].ano, meses[0].mes) : undefined;
  const mes = competenciaValida(params.mes) ?? recente;

  const base = `/portal/dre?empresa=${companyId}${mes ? `&mes=${mes}` : ""}`;

  // Os vazios vão num Card, como o "Nenhuma empresa vinculada" acima e os das
  // outras telas do portal — soltos, flutuavam no fundo da página.
  let conteudo: React.ReactNode;
  if (!mes) {
    conteudo = (
      <Card>
        <EmptyState
          icon={<FileText />}
          title="Ainda não há DRE para esta empresa"
          description="A DRE aparece aqui quando a equipe lançar os pagamentos e recebimentos do mês."
        />
      </Card>
    );
  } else if (regime === "caixa") {
    // Os números do topo com a comparação ao mês anterior, como em /dre (9A da
    // página de decisões, 08/10/2026). O mês anterior só entra quando teve
    // movimento: sem ele, "subiu 100%" sobre zero diria nada ao cliente.
    const mesAnterior = somarMeses(mes, -1);
    const temAnterior = meses.some((x) => competenciaDe(x.ano, x.mes) === mesAnterior);
    const [{ resultado, lancamentos }, doAnterior] = await Promise.all([
      dreDoMes(escopo.tenantId, companyId, partesDaCompetencia(mes)),
      temAnterior ? dreDoMes(escopo.tenantId, companyId, partesDaCompetencia(mesAnterior)) : Promise.resolve(null),
    ]);
    conteudo =
      lancamentos === 0 ? (
        <Card>
          <EmptyState icon={<FileText />} title={`Nenhum pagamento ou recebimento em ${formatarCompetencia(mes)}`} />
        </Card>
      ) : (
        <>
          <NumerosDaDre
            resultado={resultado}
            regime="caixa"
            anterior={doAnterior ? { resultado: doAnterior.resultado, rotulo: rotuloDaCompetencia(mesAnterior) } : null}
            className="mb-4"
          />
          <RelatorioDoDre resultado={resultado} />
        </>
      );
  } else {
    // O mês anterior vem na mesma consulta, como em /dre/economica.
    const mesAnterior = somarMeses(mes, -1);
    const serie = await serieEconomica(escopo.tenantId, companyId, [mes, mesAnterior]);
    const dre = serie.get(mes)!;
    const temResultado = (d: typeof dre) =>
      d.lancamentos > 0 || d.cobranca.perdas !== 0 || d.cobranca.acrescimosDeAcordo !== 0 || d.cobranca.descontosDeAcordo !== 0;
    const doAnterior = serie.get(mesAnterior);
    conteudo =
      // Mês só com perda ou diferença de acordo ainda tem resultado a mostrar.
      !temResultado(dre) ? (
        <Card>
          <EmptyState icon={<FileText />} title={`Nenhum lançamento com competência em ${formatarCompetencia(mes)}`} />
        </Card>
      ) : (
        <>
          <NumerosDaDre
            resultado={dre.resultado}
            regime="competencia"
            anterior={
              doAnterior && temResultado(doAnterior)
                ? { resultado: doAnterior.resultado, rotulo: rotuloDaCompetencia(mesAnterior) }
                : null
            }
            className="mb-4"
          />
          <RelatorioDoDre resultado={comRotulosEconomicos(dre.resultado)} />
        </>
      );
  }

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDePeriodo
        acao="/portal/dre"
        empresas={empresas.length > 1 ? empresas : undefined}
        empresaId={companyId}
        // Sem mês com movimento, não há o que escolher: o campo vazio ("-- de ----")
        // só confundia.
        mes={mes ?? undefined}
        extras={{ empresa: empresas.length > 1 ? undefined : companyId, regime: regime === "caixa" ? undefined : regime }}
      />
      {competenciaLiberada && (
        <AbasDeLink
          abas={[
            { chave: "caixa", rotulo: "Caixa", href: base },
            { chave: "competencia", rotulo: "Competência", href: `${base}&regime=competencia` },
          ]}
          ativa={regime}
        />
      )}
      {conteudo}
      {/* Nota em `text-helper` (13px) desde 07/10/2026: era 11px, o tamanho do
          cabeçalho de tabela, numa explicação que o cliente lê no celular. */}
      <p className="text-helper text-fg-muted mt-3">
        {regime === "caixa"
          ? "Regime de caixa: o que foi efetivamente pago e recebido no mês."
          : "Regime de competência: o que pertence ao mês, pago ou não."}
      </p>
    </PageContainer>
  );
}
