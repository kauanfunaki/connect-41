// Quem vê e quem emite NFS-e pelo Connect (Fase 2 do Omie, 13/10/2026).
//
// Emitir e cancelar nota é ato tributário em nome do cliente — o plano de
// 23/09 pede "só administrador do setor emite". Ver a lista do que foi emitido
// é como ver qualquer tela do setor. Função pura, sem banco nem cabeçalho, para
// a regra ter teste com perfil simulado (a conta do Kauan é admin e vê tudo).
//
// Os níveis são os de sempre (`canViewSector`/`canManageSector`), presos ao
// setor que opera o módulo neste escritório — o BPO, salvo transferência.

import { canManageSector, canViewSector } from "@/lib/auth/papeis";
import type { AuthContext } from "@/lib/auth/context";

export const MODULO_EMITIR_NFSE = "bpo_emitir_nfse";

export type AcessoAEmissao = { ver: boolean; emitir: boolean };

/**
 * - módulo desligado: ninguém, administrador do escritório inclusive;
 * - administrador do setor (e do escritório): vê, emite e cancela;
 * - usuário comum do setor e leitura geral (READONLY): só vê;
 * - outro setor: nem vê;
 * - assinatura vencida: vê, mas não emite.
 */
export function acessoAEmissao(
  ctx: Pick<AuthContext, "role" | "sectors" | "subscriptionReadOnly">,
  setor: string,
  ligado: boolean
): AcessoAEmissao {
  if (!ligado) return { ver: false, emitir: false };
  return { ver: canViewSector(ctx, setor), emitir: canManageSector(ctx, setor) };
}
