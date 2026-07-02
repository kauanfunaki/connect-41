import { isFullAccess, type AuthContext } from "@/lib/auth/context";

// Empresas e Pessoas são conhecimento geral da empresa — qualquer usuário
// autenticado do tenant pode VISUALIZAR qualquer uma, independente de setor.
// O que é restrito por papel (não por setor) é CRIAR/EDITAR/EXCLUIR, já
// controlado separadamente por canWrite() nas actions e nas telas.
export async function scopedCompanyWhere(ctx: AuthContext) {
  return { tenantId: ctx.tenantId };
}

export async function scopedPersonWhere(ctx: AuthContext) {
  return { tenantId: ctx.tenantId };
}

export function scopedPipelineWhere(ctx: AuthContext) {
  if (isFullAccess(ctx.role)) return { tenantId: ctx.tenantId };
  if (ctx.sectors.length === 0) return { tenantId: ctx.tenantId, sectorCode: "__none__" };
  return { tenantId: ctx.tenantId, sectorCode: { in: ctx.sectors } };
}

// Handoff já carrega fromSector/toSector explicitamente — o vínculo é direto,
// sem precisar resolver via Pipeline/CompanyService como em Company/Person.
export function scopedHandoffWhere(ctx: AuthContext) {
  if (isFullAccess(ctx.role)) return { tenantId: ctx.tenantId };
  if (ctx.sectors.length === 0) return { tenantId: ctx.tenantId, requestedBy: ctx.userId };
  return {
    tenantId: ctx.tenantId,
    OR: [
      { fromSector: { in: ctx.sectors } },
      { toSector: { in: ctx.sectors } },
      { requestedBy: ctx.userId },
    ],
  };
}
