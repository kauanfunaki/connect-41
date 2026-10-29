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
import { semTelasDoGeralOcultas } from "@/lib/menuGeral";
import { telasDoGeralDaPessoa } from "@/lib/menuGeralDb";
import { MODULOS_NOS_CADASTROS } from "@/lib/module-catalog";

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

  const [allModules, { labels }, fixadas, telasDoGeral] = await Promise.all([
    getTenantModuleStates(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
    codigosDeTelasFixadas(ctx.userId, ctx.tenantId),
    telasDoGeralDaPessoa(ctx),
  ]);
  // Solicitações e Arquivos são do Geral: escondidas no menu desta pessoa
  // (Configurações › Setores, 14/10/2026), também não se oferecem para fixar.
  // Fornecedores e sacados mora em Cadastros (29/10/2026, Kauan): repetir aqui
  // era a mesma tela em dois menus — como já não está no menu do setor.
  const modulos = semTelasDoGeralOcultas(
    allModules.filter((m) => m.sectorCodes.includes(code) && m.enabled && !MODULOS_NOS_CADASTROS.has(m.code)),
    telasDoGeral,
  );

  return (
    <PageContainer>
      <PageHeader title={`Telas · ${sectorLabel(labels, code)}`} subtitle="Tudo o que o setor tem no Connect. O alfinete fixa a tela no topo da sidebar." />
      {modulos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LayoutGrid size={20} />}
            title="Nenhuma tela ativa para este setor"
            description="As telas de cada setor são ligadas pelo administrador em Configurações → Setores e módulos."
          />
        </Card>
      ) : (
        <ModulosDoSetor code={code} modulos={modulos} fixadas={fixadas} />
      )}
    </PageContainer>
  );
}
