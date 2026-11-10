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

/**
 * Os setores ativos que a fila da pessoa alcança: as opções do filtro de setor
 * e, sem setor escolhido, o recorte dos Pedidos ao cliente. Saiu das telas em
 * 10/11/2026, quando o balão da aba "Pedidos ao cliente" passou a contar pelo
 * mesmo recorte (pedido do Kauan: balão como nos Chamados).
 */
export function setoresAtivosDaFila<S extends { code: string }>(ativos: readonly S[], setores: readonly string[] | null): S[] {
  return ativos.filter((s) => setores === null || setores.includes(s.code));
}

export function podeVerSolicitacao(ctx: AuthContext, s: AlvoDoAcesso): boolean {
  return canViewSector(ctx, s.sectorCode) || (!!ctx.userId && s.assigneeId === ctx.userId);
}

export function podeAgirNaSolicitacao(ctx: AuthContext, s: AlvoDoAcesso): boolean {
  if (canActOnSector(ctx, s.sectorCode)) return true;
  // O responsável fora do setor também responde — salvo leitura ou assinatura travada.
  return !!ctx.userId && s.assigneeId === ctx.userId && ctx.role !== "READONLY" && !ctx.subscriptionReadOnly;
}
