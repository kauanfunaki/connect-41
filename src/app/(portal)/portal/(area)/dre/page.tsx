import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { DreDoCliente } from "@/components/dre/DreDoCliente";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { TelaIndisponivel } from "@/components/portal/TelaIndisponivel";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";

export const dynamic = "force-dynamic";

/**
 * A DRE que o cliente recebe, dentro do portal.
 *
 * O padrão é a de **caixa** — a mesma de `/dre`, inclusive o import do Omie
 * quando o mês foi importado —, porque é o relatório que o BPO entrega hoje. A
 * de competência aparece como segunda aba só quando o tenant ligou o módulo.
 * Sem fila de classificação e sem import: classificar é trabalho da equipe.
 *
 * O corpo da tela mora em `DreDoCliente` desde 21/10/2026: é o mesmo que a
 * equipe abre no "Ver como o cliente" de `/dre`.
 */
export default async function PortalDrePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_dre")) notFound();
  if (await telaBloqueadaNoPortal(escopo.tenantId, "/portal/dre")) return <TelaIndisponivel />;

  const params = await searchParams;
  const empresas = await empresasDoSeletor(escopo.tenantId, escopo.companyIds ?? []);
  const companyId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : empresas[0]?.id;

  return (
    <PageContainer>
      <PortalCabecalho titulo="DRE" descricao="Demonstrativo de resultado por empresa, do mês ou do ano inteiro." />
      {companyId ? (
        <DreDoCliente
          tenantId={escopo.tenantId}
          companyId={companyId}
          params={params}
          competenciaLiberada={modulos.has("dre_economica")}
          acao="/portal/dre"
          empresas={empresas}
        />
      ) : (
        <Card>
          <EmptyState icon={<FileText />} title="Nenhuma empresa vinculada" />
        </Card>
      )}
    </PageContainer>
  );
}
