// Quem da equipe abre uma pendência — e, com ela, baixa os anexos (09/10/2026).
//
// A régua é uma só para a tela `/pendencias/[id]`, a rota de download
// `/api/pendencias/anexos/[id]` e a pasta "Do Connect" dos Arquivos:
//
//   1. a pendência é do escritório de quem pede (outro escritório, nunca);
//   2. os pedidos ao cliente estão ligados no escritório — o módulo do BPO
//      (`bpo_pendencias`) ou o canal do portal (`portal_solicitacoes`);
//   3. quem pede enxerga o setor DA PENDÊNCIA (o que pediu; as de antes de
//      01/10, sem setor, são do setor do módulo).
//
// Antes, a rota de download exigia o módulo do BPO e o setor do módulo: o
// pedido feito pelo DP ou pelo Fiscal abria na tela e o anexo dava 403. Com a
// régua num lugar só, as três portas não voltam a divergir.

import type { AuthContext } from "@/lib/auth/context";
import { canViewSector } from "@/lib/auth/papeis";
import { pedidosAoClienteLigados, setorDaPendencia, setorPadraoDasPendencias } from "./setor";

/** O que a régua precisa saber do escritório: se os pedidos estão ligados e o setor das sem setor. */
export type ReguaDasPendencias = { ligados: boolean; padrao: string };

/** O que a régua precisa saber da pendência. */
export type PendenciaParaAcesso = { tenantId: string; sectorCode: string | null };

type Quem = Pick<AuthContext, "tenantId" | "role" | "sectors" | "subscriptionReadOnly">;

export async function reguaDasPendencias(tenantId: string): Promise<ReguaDasPendencias> {
  const [ligados, padrao] = await Promise.all([pedidosAoClienteLigados(tenantId), setorPadraoDasPendencias(tenantId)]);
  return { ligados, padrao };
}

/** A pessoa da equipe pode abrir esta pendência (e baixar os anexos dela)? */
export function podeAbrirPendencia(ctx: Quem, regua: ReguaDasPendencias, pendencia: PendenciaParaAcesso): boolean {
  if (!ctx.tenantId || pendencia.tenantId !== ctx.tenantId) return false;
  if (!regua.ligados) return false;
  return canViewSector(ctx, setorDaPendencia(pendencia.sectorCode, regua.padrao));
}
