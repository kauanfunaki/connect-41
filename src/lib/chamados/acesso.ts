import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector, isFullWrite } from "@/lib/auth/papeis";

export type ConfigDeAcesso = { enabled: boolean; sectorCode: string; requesterSectors: string[] };
export type Alvo = { tenantId: string; createdById: string; requesterSectorCode: string; participants: { userId: string }[]; approverIds: string[] };
export const podeOperar = (ctx: AuthContext, config: ConfigDeAcesso) => config.enabled && ctx.sectors.includes(config.sectorCode) && canActOnSector(ctx, config.sectorCode);
export const podeGerenciar = (ctx: AuthContext, config: ConfigDeAcesso) => config.enabled && canManageSector(ctx, config.sectorCode);
export const podeVerInterno = (ctx: AuthContext, config: ConfigDeAcesso) => config.enabled && ctx.sectors.includes(config.sectorCode);
export const podeVerIndicadores = podeOperar;
export function podeAbrir(ctx: AuthContext, config: ConfigDeAcesso) {
  return !!ctx.userId && !!ctx.tenantId && config.enabled && !ctx.subscriptionReadOnly && ctx.role !== "READONLY" && (isFullWrite(ctx.role) || ctx.sectors.some(s => config.requesterSectors.includes(s)));
}
export function podeVer(ctx: AuthContext, config: ConfigDeAcesso, chamado: Alvo) {
  return ctx.tenantId === chamado.tenantId && config.enabled && (podeVerInterno(ctx, config) || chamado.createdById === ctx.userId || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.includes(chamado.requesterSectorCode)));
}
export function podeResponder(ctx: AuthContext, config: ConfigDeAcesso, chamado: Alvo, status: string, interna: boolean) {
  if (!podeVer(ctx, config, chamado) || ctx.subscriptionReadOnly || ctx.role === "READONLY") return false;
  if (podeOperar(ctx, config)) return status !== "RESOLVIDO" && status !== "CANCELADO";
  return !interna && (status === "AGUARDANDO_USUARIO" || status === "AGUARDANDO_REQUERENTE") && (chamado.createdById === ctx.userId || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.includes(chamado.requesterSectorCode)));
}
