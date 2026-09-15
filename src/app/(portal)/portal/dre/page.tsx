import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { contextoFinanceiroDoPortal } from "../../financeiro";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { dreDoMes, mesesComMovimento } from "@/lib/dre/data";
import { serieEconomica } from "@/lib/dre/dataEconomica";
import { comRotulosEconomicos } from "@/lib/dre/economica";
import { competenciaValida, competenciaDe, partesDaCompetencia, rotuloDaCompetencia } from "@/lib/financeiro/periodo";

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
  const { escopo, modulos, grupoNome } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_dre")) notFound();

  const params = await searchParams;
  const competenciaLiberada = modulos.has("dre_economica");
  const regime = params.regime === "competencia" && competenciaLiberada ? "competencia" : "caixa";

  const empresas = await empresasDoSeletor(escopo.tenantId, escopo.companyIds ?? []);
  const companyId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : empresas[0]?.id;

  const cabecalho = (
    <PortalCabecalho titulo="DRE" descricao="demonstrativo de resultado por empresa e mês." grupoNome={grupoNome} ativo="dre" modulos={modulos} />
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

  let conteudo: React.ReactNode;
  if (!mes) {
    conteudo = <EmptyState icon={<FileText />} title="Ainda não há DRE para esta empresa" />;
  } else if (regime === "caixa") {
    const { ano, mes: m } = partesDaCompetencia(mes);
    const { resultado, lancamentos } = await dreDoMes(escopo.tenantId, companyId, { ano, mes: m });
    conteudo =
      lancamentos === 0 ? (
        <EmptyState icon={<FileText />} title={`Nenhum pagamento ou recebimento em ${rotuloDaCompetencia(mes)}`} />
      ) : (
        <RelatorioDoDre resultado={resultado} />
      );
  } else {
    const dre = (await serieEconomica(escopo.tenantId, companyId, [mes])).get(mes)!;
    conteudo =
      dre.lancamentos === 0 ? (
        <EmptyState icon={<FileText />} title={`Nenhum lançamento com competência em ${rotuloDaCompetencia(mes)}`} />
      ) : (
        <RelatorioDoDre resultado={comRotulosEconomicos(dre.resultado)} />
      );
  }

  return (
    <PageContainer variant="narrow">
      {cabecalho}
      <FiltroDePeriodo
        acao="/portal/dre"
        empresas={empresas.length > 1 ? empresas : undefined}
        empresaId={companyId}
        mes={mes ?? ""}
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
      <p className="text-[11px] text-fg-muted mt-3">
        {regime === "caixa"
          ? "Regime de caixa: o que foi efetivamente pago e recebido no mês."
          : "Regime de competência: o que pertence ao mês, pago ou não."}
      </p>
    </PageContainer>
  );
}
