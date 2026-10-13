import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { ContextoFiscalProvider } from "@/components/fiscal/previa/ContextoFiscal";

export default async function FiscalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  const estados = await getTenantModuleStates(ctx.tenantId);
  const modulos = estados.filter((m) => m.enabled && canViewSector(ctx, m.sectorCode)).map((m) => m.code);
  return <ContextoFiscalProvider key={`${ctx.tenantId}:${ctx.userId}`} tenantId={ctx.tenantId} userId={ctx.userId} modulos={modulos} integrado={modulos.includes("fiscal_documentos")}>{children}</ContextoFiscalProvider>;
}
