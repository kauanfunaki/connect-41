import { notFound } from "next/navigation";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { grupoDoSlug } from "@/lib/module-catalog";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { ModulosDoSetor } from "@/components/setor/ModulosDoSetor";
import { codigosDeTelasFixadas } from "@/lib/telasFixadas-data";

// As telas de um grupo do setor — onde a sidebar cai ao clicar no grupo.
//
// Um grupo virou endereço em vez de uma seção que abre e fecha na sidebar
// (pedido do Kauan em 17/09): clicar em "Contas" abre esta tela com as contas, e
// só elas. A sidebar volta a ter uma linha por grupo, e não quinze itens.
//
// Rota própria, e não `?grupo=` na tela do setor, porque a sidebar marca o item
// ativo pelo caminho: com query, "Espaços" (que aponta para `/setor/[code]`)
// acenderia junto de qualquer grupo.
export default async function GrupoDoSetorPage({
  params,
}: {
  params: Promise<{ code: string; grupo: string }>;
}) {
  const { code, grupo: slug } = await params;
  const ctx = await getAuthContext();
  if (!canViewSector(ctx, code)) notFound();

  const grupo = grupoDoSlug(slug);
  if (!grupo) notFound();

  const [allModules, { labels, colors }, fixadas] = await Promise.all([
    getTenantModuleStates(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
    codigosDeTelasFixadas(ctx.userId, ctx.tenantId),
  ]);
  const modules = allModules.filter((m) => m.sectorCode === code && m.enabled);
  // Grupo sem módulo ligado neste cliente não é tela vazia: é endereço que não
  // existe aqui — o módulo pode estar desligado ou pertencer a outro setor.
  if (!modules.some((m) => m.group === grupo)) notFound();

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <PageHeader title={sectorLabel(labels, code)} subtitle={`${grupo} — telas deste grupo.`} />
      <ModulosDoSetor code={code} modulos={modules} cor={colors[code] ?? "#586577"} grupoAtivo={grupo} fixadas={fixadas} />
    </PageContainer>
  );
}
