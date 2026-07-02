import { headers } from "next/headers";
import type { UserRole } from "@/generated/prisma/enums";

export interface AuthContext {
  userId: string;
  tenantId: string;
  homeTenantId: string;
  role: UserRole;
  sectors: string[];
}

export async function getAuthContext(): Promise<AuthContext> {
  const h = await headers();
  const tenantId = h.get("x-tenant-id") ?? "";
  return {
    userId: h.get("x-user-id") ?? "",
    tenantId,
    homeTenantId: h.get("x-home-tenant-id") ?? tenantId,
    role: (h.get("x-user-role") ?? "SECTOR_USER") as UserRole,
    sectors: h.get("x-user-sectors")?.split(",").filter(Boolean) ?? [],
  };
}

// SUPER_ADMIN e ADMIN enxergam/gerenciam tudo do tenant; READONLY enxerga tudo mas nunca escreve.
export function isFullAccess(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "READONLY";
}

export function isFullWrite(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

// Pode criar/editar/excluir (fora do escopo estrito de setor de pipeline).
export function canWrite(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "SECTOR_ADMIN";
}

// Pode registrar atividade (nota, mudança de estágio) — inclui SECTOR_USER.
export function canAct(role: UserRole): boolean {
  return role !== "READONLY";
}

export function canManageSector(ctx: AuthContext, sectorCode: string): boolean {
  if (isFullWrite(ctx.role)) return true;
  if (ctx.role === "READONLY") return false;
  return ctx.role === "SECTOR_ADMIN" && ctx.sectors.includes(sectorCode);
}

export function canActOnSector(ctx: AuthContext, sectorCode: string): boolean {
  if (isFullAccess(ctx.role)) return ctx.role !== "READONLY";
  return ctx.sectors.includes(sectorCode);
}

export function canViewSector(ctx: AuthContext, sectorCode: string): boolean {
  if (isFullAccess(ctx.role)) return true;
  return ctx.sectors.includes(sectorCode);
}
