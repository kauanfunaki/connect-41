import { getPrisma } from "@/lib/prisma";
import { isFullAccess, type AuthContext } from "@/lib/auth/context";

// Empresas e Pessoas não têm sectorCode próprio — o vínculo setorial vem de
// CompanyService (serviço contratado) e/ou de aparecer como item em um Pipeline
// de um setor. Usuários com escopo restrito só enxergam entidades ligadas a
// pelo menos um dos seus setores por uma dessas duas vias.

export async function scopedCompanyWhere(ctx: AuthContext) {
  if (isFullAccess(ctx.role)) return { tenantId: ctx.tenantId };
  if (ctx.sectors.length === 0) return { tenantId: ctx.tenantId, id: "__none__" };

  const prisma = getPrisma();
  const items = await prisma.pipelineItem.findMany({
    where: {
      tenantId: ctx.tenantId,
      entityType: "COMPANY",
      pipeline: { sectorCode: { in: ctx.sectors } },
    },
    select: { entityId: true },
  });

  return {
    tenantId: ctx.tenantId,
    OR: [
      { id: { in: items.map((i) => i.entityId) } },
      { services: { some: { sectorCode: { in: ctx.sectors } } } },
    ],
  };
}

export async function scopedPersonWhere(ctx: AuthContext) {
  if (isFullAccess(ctx.role)) return { tenantId: ctx.tenantId };
  if (ctx.sectors.length === 0) return { tenantId: ctx.tenantId, id: "__none__" };

  const prisma = getPrisma();
  const items = await prisma.pipelineItem.findMany({
    where: {
      tenantId: ctx.tenantId,
      entityType: "PERSON",
      pipeline: { sectorCode: { in: ctx.sectors } },
    },
    select: { entityId: true },
  });

  return {
    tenantId: ctx.tenantId,
    OR: [
      { id: { in: items.map((i) => i.entityId) } },
      { currentCompany: { services: { some: { sectorCode: { in: ctx.sectors } } } } },
    ],
  };
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
