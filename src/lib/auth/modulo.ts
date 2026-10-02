import { notFound } from "next/navigation";
import { getAuthContext, canViewSector, canActOnSector, canManageSector, type AuthContext } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";

// Porta de entrada das telas e das ações de um módulo (02/10/2026).
//
// O BPO e o Societário já repetiam, tela a tela, o mesmo gate: o setor que opera
// o módulo neste escritório + o módulo ligado. O DP, os Indicadores de RH e os
// Candidatos não tinham gate nenhum — qualquer pessoa do escritório abria férias,
// rescisões, afastamentos e currículos digitando o endereço, e gravava neles
// com um perfil de coordenador de outro setor. Este arquivo é o gate num lugar
// só, para as telas que faltavam (e para as que vierem).

/** O que a pessoa precisa poder fazer no setor do módulo. */
export type NivelNoModulo = "ver" | "agir" | "gerir";

/**
 * A regra, sem banco: pode se o módulo está ligado e o perfil alcança o setor
 * no nível pedido. Os níveis são os de sempre — `canViewSector`,
 * `canActOnSector` e `canManageSector` — e "gerir" é o que as ações antigas
 * pediam com `canWrite(role)`, só que preso ao setor certo.
 */
export function alcancaModulo(ctx: AuthContext, setor: string, ligado: boolean, nivel: NivelNoModulo): boolean {
  if (!ligado) return false;
  if (nivel === "gerir") return canManageSector(ctx, setor);
  if (nivel === "agir") return canActOnSector(ctx, setor);
  return canViewSector(ctx, setor);
}

async function situacaoDoModulo(tenantId: string, modulo: string) {
  const [setor, ligado] = await Promise.all([setorDoModulo(tenantId, modulo), isModuleEnabled(tenantId, modulo)]);
  return { setor, ligado };
}

/** Se a pessoa alcança o módulo — para ações e para esconder link de tela que ela não abre. */
export async function podeNoModulo(ctx: AuthContext, modulo: string, nivel: NivelNoModulo): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const { setor, ligado } = await situacaoDoModulo(ctx.tenantId, modulo);
  return setor !== null && alcancaModulo(ctx, setor, ligado, nivel);
}

/**
 * Para a página de um módulo: devolve o contexto e o setor que opera o módulo,
 * ou responde 404 — o mesmo de uma rota que não existe, para não confirmar a
 * quem não é do setor que a tela existe.
 */
export async function abrirTelaDoModulo(modulo: string): Promise<{ ctx: AuthContext; setor: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const { setor, ligado } = await situacaoDoModulo(ctx.tenantId, modulo);
  if (setor === null || !alcancaModulo(ctx, setor, ligado, "ver")) notFound();
  return { ctx, setor };
}
