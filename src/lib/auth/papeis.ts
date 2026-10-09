// As regras de papel da equipe — funções puras, sem banco nem cabeçalho.
//
// Viviam em ./context.ts, que lê os cabeçalhos do proxy (next/headers) e o
// Prisma. Saíram para cá em 09/10/2026 porque os Arquivos usam estas regras em
// componente de cliente e no motor de alertas, que roda na instrumentação, e
// nenhum dos dois pode puxar next/headers. ./context.ts reexporta tudo.

import type { UserRole } from "@/generated/prisma/enums";
import type { AuthContext } from "./context";

/** O que as regras leem de quem pede. */
type Quem = Pick<AuthContext, "role" | "sectors" | "subscriptionReadOnly">;

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

export function canManageSector(ctx: Quem, sectorCode: string): boolean {
  if (ctx.subscriptionReadOnly) return false;
  if (isFullWrite(ctx.role)) return true;
  if (ctx.role === "READONLY") return false;
  return ctx.role === "SECTOR_ADMIN" && ctx.sectors.includes(sectorCode);
}

export function canActOnSector(ctx: Quem, sectorCode: string): boolean {
  if (ctx.subscriptionReadOnly) return false;
  if (isFullAccess(ctx.role)) return ctx.role !== "READONLY";
  return ctx.sectors.includes(sectorCode);
}

export function canViewSector(ctx: Quem, sectorCode: string): boolean {
  if (isFullAccess(ctx.role)) return true;
  return ctx.sectors.includes(sectorCode);
}
