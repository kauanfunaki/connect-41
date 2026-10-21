import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { ContextoFiscalProvider } from "@/components/fiscal/previa/ContextoFiscal";
import { lerEstadoFiscalLocal } from "@/lib/fiscal/local/servidor";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";

export default async function FiscalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  const estados = await getTenantModuleStates(ctx.tenantId);
  const modulos = estados.filter((m) => m.enabled && canViewSector(ctx, m.sectorCodes)).map((m) => m.code);
  const inicial = await lerEstadoFiscalLocal(ctx);
  if (!inicial) return <PageContainer><EmptyState title="Processamento fiscal indisponível" description="O motor SPED ainda precisa ser conectado. Os dados de demonstração ficam disponíveis somente no banco local de testes." /></PageContainer>;
  return <ContextoFiscalProvider key={`${ctx.tenantId}:${ctx.userId}`} tenantId={ctx.tenantId} userId={ctx.userId} inicial={inicial} modulos={modulos} integrado={modulos.includes("fiscal_documentos")}>{children}</ContextoFiscalProvider>;
}
