// Quem manda comunicado (01/10). Fora de `regras.ts` porque depende do contexto
// de autenticação, que é do servidor — e as regras também servem ao formulário,
// que roda no navegador.

import { canManageSector, isFullWrite, type AuthContext } from "@/lib/auth/context";

/**
 * Administrador, ou a coordenação do setor que comunica. É e-mail para dezenas
 * de clientes de uma vez — não é coisa de qualquer um.
 */
export function podeComunicarPeloSetor(ctx: AuthContext, setor: string): boolean {
  if (ctx.subscriptionReadOnly) return false;
  return isFullWrite(ctx.role) || canManageSector(ctx, setor);
}
