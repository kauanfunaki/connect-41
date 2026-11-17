import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { ContextoFiscalProvider } from "@/components/fiscal/previa/ContextoFiscal";
import { lerEstadoFiscalLocal } from "@/lib/fiscal/local/servidor";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";

/**
 * Três fontes, nesta ordem (22/10/2026): o motor SPED real, quando a
 * integração `sped` está ligada e completa; a prévia do banco local de
 * desenvolvimento; ou o aviso de indisponível. No modo real cada página busca
 * os próprios dados no servidor — não há cenário no cliente.
 */
export default async function FiscalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  const modo = await modoDoFiscal(ctx);
  // A nota fixa do pé ("Dados do motor SPED…") foi para o artigo de ajuda (17/11/2026, melhoria-707).
  if (modo === "motor") return <PageContainer>{children}</PageContainer>;
  const estados = await getTenantModuleStates(ctx.tenantId);
  const modulos = estados.filter((m) => m.enabled && canViewSector(ctx, m.sectorCodes)).map((m) => m.code);
  const inicial = modo === "local" ? await lerEstadoFiscalLocal(ctx) : null;
  if (!inicial) return <PageContainer><EmptyState title="Processamento fiscal indisponível" description="O motor SPED ainda precisa ser conectado." /></PageContainer>;
  return <ContextoFiscalProvider key={`${ctx.tenantId}:${ctx.userId}`} tenantId={ctx.tenantId} userId={ctx.userId} inicial={inicial} modulos={modulos} integrado={modulos.includes("fiscal_documentos")}>{children}</ContextoFiscalProvider>;
}
