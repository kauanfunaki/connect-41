// Quem vê e quem faz o quê no Atendimento — funções puras, testadas em `acesso.test.ts`.
//
// Todo mundo tem a aba no menu Geral. Dentro dela:
// - a triagem (o setor do módulo, a Controladoria por padrão) e o administrador
//   veem tudo, encaminham direto e decidem os pedidos de troca de setor;
// - quem é do setor da conversa, ou o responsável por ela, assume, responde,
//   transfere a alguém do setor, pede outro setor e encerra;
// - o gestor do setor vê o setor inteiro ("Do setor").

import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector, canViewSector, isFullWrite } from "@/lib/auth/papeis";
import type { Situacao } from "./regras";

export type ConfigDeAcesso = { enabled: boolean; triagem: string };
export type CicloParaAcesso = { sectorCode: string | null; assignedToId: string | null; situacao: Situacao };

const soLeitura = (ctx: AuthContext) => ctx.subscriptionReadOnly || ctx.role === "READONLY";

/** É da triagem: o setor do módulo ou o administrador do escritório. */
export function ehDaTriagem(ctx: AuthContext, cfg: ConfigDeAcesso): boolean {
  return cfg.enabled && (ctx.sectors.includes(cfg.triagem) || isFullWrite(ctx.role));
}

export function podeVerCiclo(ctx: AuthContext, cfg: ConfigDeAcesso, c: CicloParaAcesso): boolean {
  if (!cfg.enabled) return false;
  if (ehDaTriagem(ctx, cfg)) return true;
  if (c.assignedToId && c.assignedToId === ctx.userId) return true;
  return !!c.sectorCode && canViewSector(ctx, c.sectorCode);
}

/** Pode responder, mandar nota, transferir e encerrar. */
export function podeAgirNoCiclo(ctx: AuthContext, cfg: ConfigDeAcesso, c: CicloParaAcesso): boolean {
  if (!cfg.enabled || soLeitura(ctx) || c.situacao === "ENCERRADO") return false;
  if (ehDaTriagem(ctx, cfg)) return true;
  if (c.assignedToId && c.assignedToId === ctx.userId) return true;
  return !!c.sectorCode && canActOnSector(ctx, c.sectorCode);
}

export function podeAssumir(ctx: AuthContext, cfg: ConfigDeAcesso, c: CicloParaAcesso): boolean {
  return podeAgirNoCiclo(ctx, cfg, c) && c.assignedToId !== ctx.userId;
}

/** Responder ao cliente exige ser o responsável: quem não assumiu assume primeiro. */
export function podeResponder(ctx: AuthContext, cfg: ConfigDeAcesso, c: CicloParaAcesso): boolean {
  return podeAgirNoCiclo(ctx, cfg, c) && c.assignedToId === ctx.userId;
}

/** A triagem encaminha direto, sem pedido. */
export function podeEncaminharDireto(ctx: AuthContext, cfg: ConfigDeAcesso, c: CicloParaAcesso): boolean {
  return ehDaTriagem(ctx, cfg) && !soLeitura(ctx) && c.situacao !== "ENCERRADO";
}

/** Quem está no setor pede outro setor; a triagem aprova. */
export function podePedirEncaminhamento(ctx: AuthContext, cfg: ConfigDeAcesso, c: CicloParaAcesso): boolean {
  return !ehDaTriagem(ctx, cfg) && !!c.sectorCode && podeAgirNoCiclo(ctx, cfg, c);
}

export function podeDecidirPedido(ctx: AuthContext, cfg: ConfigDeAcesso): boolean {
  return ehDaTriagem(ctx, cfg) && !soLeitura(ctx);
}

/** Ver o setor inteiro, com quem está cada conversa. */
export function podeVerDoSetor(ctx: AuthContext, cfg: ConfigDeAcesso, sectorCode: string): boolean {
  return cfg.enabled && canManageSector(ctx, sectorCode);
}

export function podeConfigurar(ctx: AuthContext, cfg: ConfigDeAcesso): boolean {
  return cfg.enabled && canManageSector(ctx, cfg.triagem);
}

/** Os setores em que a pessoa atende conversas (não a triagem). */
export function setoresDaPessoa(ctx: AuthContext, cfg: ConfigDeAcesso, setoresQueAtendem: readonly string[]): string[] {
  if (isFullWrite(ctx.role)) return [...setoresQueAtendem];
  return setoresQueAtendem.filter((s) => ctx.sectors.includes(s) && s !== cfg.triagem);
}
