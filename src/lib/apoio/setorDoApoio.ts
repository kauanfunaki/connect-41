import { canActOnSector, isFullAccess } from "@/lib/auth/papeis";
import type { AuthContext } from "@/lib/auth/context";

// O Apoio no Geral (05/11/2026, escolha do Kauan): Repositório de senhas,
// Repositório de manuais e Quadros deixam de ser só do BPO e passam a existir
// em todo setor. Cada setor tem os seus — as senhas do BPO são de portais e
// bancos dos clientes, e não podem aparecer para o DP só porque a tela ficou
// geral. Esta é a regra de qual setor a tela mostra.

type Quem = Pick<AuthContext, "role" | "sectors" | "subscriptionReadOnly" | "activeSector">;

/** Onde os dados de antes moram: as duas telas nasceram no BPO. */
export const SETOR_DO_APOIO_ANTIGO = "bpo";

/**
 * Os setores cujo Apoio a pessoa pode abrir: os dela, ou todos os do escritório
 * para quem tem acesso total — sempre com a regra de agir no setor
 * (`canActOnSector`), a mesma que as telas usavam.
 */
export function setoresDoApoio(ctx: Quem, setoresDoEscritorio: readonly string[]): string[] {
  const base = isFullAccess(ctx.role) ? setoresDoEscritorio : setoresDoEscritorio.filter((s) => ctx.sectors.includes(s));
  return base.filter((s) => canActOnSector(ctx, s));
}

/**
 * O setor que a tela mostra: o pedido no endereço (`?setor=`), se a pessoa
 * alcança; senão o setor em que ela está; senão o primeiro dos dela; senão o
 * BPO (onde estão os dados antigos); senão o primeiro que ela alcança. Nulo:
 * nenhum setor ao alcance — a tela não abre.
 */
export function setorDoApoio(ctx: Quem, disponiveis: readonly string[], pedido?: string | null): string | null {
  if (pedido && disponiveis.includes(pedido)) return pedido;
  if (ctx.activeSector && disponiveis.includes(ctx.activeSector)) return ctx.activeSector;
  const dela = ctx.sectors.find((s) => disponiveis.includes(s));
  if (dela) return dela;
  if (disponiveis.includes(SETOR_DO_APOIO_ANTIGO)) return SETOR_DO_APOIO_ANTIGO;
  return disponiveis[0] ?? null;
}
