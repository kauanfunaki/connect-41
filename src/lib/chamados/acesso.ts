import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector, isFullWrite } from "@/lib/auth/papeis";

// Todos os setores abrem chamado (05/11/2026): a lista de setores solicitantes saiu.
//
// Um ou mais setores administram os chamados (12/11/2026, funcionalidade-640):
// `sectorCodes` são os setores do módulo no escritório (o dono primeiro, que é
// o padrão de quem abre sem escolher), e cada chamado guarda o setor que o
// atende (`handlingSectorCode`). Atender, gerir e ver o que é interno passam a
// valer por chamado, no setor dele.
export type ConfigDeAcesso = { enabled: boolean; sectorCode: string; sectorCodes: string[] };
export type Alvo = { tenantId: string; createdById: string; requesterSectorCode: string; handlingSectorCode: string; participants: { userId: string }[]; approverIds: string[] };

/** Os setores administradores em que a pessoa atende. */
export const setoresQueAtendo = (ctx: AuthContext, config: ConfigDeAcesso) =>
  config.enabled ? config.sectorCodes.filter(s => ctx.sectors.includes(s) && canActOnSector(ctx, s)) : [];
/** Atende em algum setor administrador. */
export const podeOperar = (ctx: AuthContext, config: ConfigDeAcesso) => setoresQueAtendo(ctx, config).length > 0;
/** Atende os chamados deste setor. Um setor que deixou de administrar não atende até o chamado ser redirecionado. */
export const podeOperarNo = (ctx: AuthContext, config: ConfigDeAcesso, setor: string) =>
  config.enabled && config.sectorCodes.includes(setor) && ctx.sectors.includes(setor) && canActOnSector(ctx, setor);
export const podeGerenciar = (ctx: AuthContext, config: ConfigDeAcesso) => config.enabled && config.sectorCodes.some(s => canManageSector(ctx, s));
export const podeGerenciarNo = (ctx: AuthContext, config: ConfigDeAcesso, setor: string) => config.enabled && canManageSector(ctx, setor);
/** Escolher os setores que administram é do administrador do escritório. */
export const podeEscolherSetores = (ctx: AuthContext, config: ConfigDeAcesso) => config.enabled && isFullWrite(ctx.role);
/**
 * Redirecionar o chamado para outro setor administrador: a equipe do setor que
 * atende e o administrador do escritório. Só faz sentido com dois ou mais.
 */
export const podeRedirecionar = (ctx: AuthContext, config: ConfigDeAcesso, setor: string) =>
  config.enabled && config.sectorCodes.length > 1 && !ctx.subscriptionReadOnly && ctx.role !== "READONLY" && (isFullWrite(ctx.role) || podeOperarNo(ctx, config, setor));
// Quem acompanha a fila (27/10/2026): a equipe de um setor administrador e o
// administrador. O resto vê só o que abriu; o gestor do setor, também o que o
// setor dele abriu (`podeVer`/`whereVisivel`).
export const podeVerInterno = (ctx: AuthContext, config: ConfigDeAcesso) => config.enabled && (config.sectorCodes.some(s => ctx.sectors.includes(s)) || isFullWrite(ctx.role));
/** Vê o que é interno deste chamado: a equipe do setor que atende e o administrador. */
export const podeVerInternoNo = (ctx: AuthContext, config: ConfigDeAcesso, setor: string) => config.enabled && (ctx.sectors.includes(setor) || isFullWrite(ctx.role));
export const podeVerIndicadores = podeOperar;
// Onde a busca da lista procura, por papel (27/10/2026): a equipe procura em
// tudo; o coordenador do setor, também por quem abriu; o resto, só no chamado.
export const ESCOPOS_DA_BUSCA = ["chamado", "solicitante", "setor", "responsavel"] as const;
export type EscopoDaBusca = (typeof ESCOPOS_DA_BUSCA)[number];
export function escoposDaBusca(ctx: AuthContext, config: ConfigDeAcesso): EscopoDaBusca[] {
  if (podeVerInterno(ctx, config)) return [...ESCOPOS_DA_BUSCA];
  return ctx.role === "SECTOR_ADMIN" ? ["chamado", "solicitante"] : ["chamado"];
}
export function podeAbrir(ctx: AuthContext, config: ConfigDeAcesso) {
  return !!ctx.userId && !!ctx.tenantId && config.enabled && !ctx.subscriptionReadOnly && ctx.role !== "READONLY";
}
/** De onde a pessoa pode abrir: o campo Setor da tela Novo chamado e o da Ceci (`conferirOrigem` confere de novo ao gravar). */
export function setoresQuePodemAbrir<T extends { code: string }>(ctx: AuthContext, config: ConfigDeAcesso, ativos: T[]): T[] {
  return ativos.filter(s => isFullWrite(ctx.role) || ctx.sectors.includes(s.code));
}
/** O setor que vai atender: o escolhido, se administra os chamados; senão o padrão (o dono do módulo). */
export function setorQueAtende(config: ConfigDeAcesso, escolhido: string | null | undefined): string {
  const s = escolhido?.trim();
  return s && config.sectorCodes.includes(s) ? s : config.sectorCode;
}
export function podeVer(ctx: AuthContext, config: ConfigDeAcesso, chamado: Alvo) {
  return ctx.tenantId === chamado.tenantId && config.enabled && (podeVerInternoNo(ctx, config, chamado.handlingSectorCode) || chamado.createdById === ctx.userId || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.includes(chamado.requesterSectorCode)));
}
export function podeResponder(ctx: AuthContext, config: ConfigDeAcesso, chamado: Alvo, status: string, interna: boolean) {
  if (!podeVer(ctx, config, chamado) || ctx.subscriptionReadOnly || ctx.role === "READONLY") return false;
  if (podeOperarNo(ctx, config, chamado.handlingSectorCode)) return status !== "RESOLVIDO" && status !== "CANCELADO";
  return !interna && (status === "AGUARDANDO_USUARIO" || status === "AGUARDANDO_REQUERENTE") && (chamado.createdById === ctx.userId || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.includes(chamado.requesterSectorCode)));
}
