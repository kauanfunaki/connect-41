import { notFound } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { ModulosDoSetor } from "@/components/setor/ModulosDoSetor";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { codigosDeTelasFixadas } from "@/lib/telasFixadas-data";
import { getTenantModuleStates } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";

/**
 * Todas as telas de um setor, em cartões por grupo — onde se fixa uma tela na
 * sidebar.
 *
 * Morava em `/setor/[code]`, em cima dos espaços. Em 30/09 o Kauan pediu que
 * "Espaços" fosse só espaços (listas e quadros): as telas o menu já mostra, e
 * abrir "Espaços" para achar uma lista de telas no topo confundia as duas
 * coisas. Chega-se aqui pela aba "Tudo" dos grupos e pela central de ajuda.
 */
export default async function TelasDoSetorPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = await getAuthContext();
  if (!canViewSector(ctx, code)) notFound();

  const [allModules, { labels, colors }, fixadas] = await Promise.all([
    getTenantModuleStates(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
    codigosDeTelasFixadas(ctx.userId, ctx.tenantId),
  ]);
  const modulos = allModules.filter((m) => m.sectorCode === code && m.enabled);

  return (
    <PageContainer>
      <PageHeader title={`Telas · ${sectorLabel(labels, code)}`} subtitle="Tudo o que o setor tem no Connect. O alfinete fixa a tela no topo da sidebar." />
      {modulos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LayoutGrid size={20} />}
            title="Nenhuma tela ativa para este setor"
            description="As telas de cada setor são ligadas pelo administrador em Configurações → Módulos."
          />
        </Card>
      ) : (
        <ModulosDoSetor code={code} modulos={modulos} cor={colors[code] ?? "#586577"} fixadas={fixadas} />
      )}
    </PageContainer>
  );
}
