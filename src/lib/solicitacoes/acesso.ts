// Quem da 41 vê e quem age numa solicitação do cliente.
//
// A solicitação é do **setor que atende** (o do assunto, ou para onde foi
// encaminhada): quem é do setor vê e age; administrador vê tudo. Quem foi posto
// como responsável vê e age mesmo fora do setor — o responsável da empresa
// (`CompanyService`) às vezes é de outro cadastro, e a solicitação que caiu com
// ele não pode sumir da tela dele.

import { canActOnSector, canViewSector, isFullAccess, type AuthContext } from "@/lib/auth/context";

type AlvoDoAcesso = { sectorCode: string; assigneeId: string | null };

/** Setores da fila da pessoa; `null` = todos (administrador e leitura total). */
export function setoresDaFila(ctx: AuthContext): string[] | null {
  return isFullAccess(ctx.role) ? null : ctx.sectors;
}

export function podeVerSolicitacao(ctx: AuthContext, s: AlvoDoAcesso): boolean {
  return canViewSector(ctx, s.sectorCode) || (!!ctx.userId && s.assigneeId === ctx.userId);
}

export function podeAgirNaSolicitacao(ctx: AuthContext, s: AlvoDoAcesso): boolean {
  if (canActOnSector(ctx, s.sectorCode)) return true;
  // O responsável fora do setor também responde — salvo leitura ou assinatura travada.
  return !!ctx.userId && s.assigneeId === ctx.userId && ctx.role !== "READONLY" && !ctx.subscriptionReadOnly;
}
