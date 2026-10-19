import "server-only";
import { getPrisma } from "@/lib/prisma";
import { podeNoModulo } from "@/lib/auth/modulo";
import type { AuthContext } from "@/lib/auth/context";
import { PAGINAS_FISCAIS, lerCenario, type Cenario } from "@/lib/fiscal/previa/cenario";
import { bancoFiscalLocal } from "./ambiente";

export type EstadoFiscalLocal = { cenario: Cenario; favoritas: string[]; revisao: number };
export async function acessoFiscalLocal(ctx: AuthContext) {
  if (!bancoFiscalLocal() || !ctx.tenantId || !ctx.userId) return false;
  const acessos = await Promise.all(PAGINAS_FISCAIS.map((p) => podeNoModulo(ctx, p.modulo, "ver")));
  return acessos.some(Boolean);
}
export async function lerEstadoFiscalLocal(ctx: AuthContext): Promise<EstadoFiscalLocal | null> {
  if (!await acessoFiscalLocal(ctx)) return null;
  const registro = await getPrisma().localFiscalScenario.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } } });
  if (!registro) return null;
  const cenario = lerCenario(JSON.stringify(registro.data));
  if (!cenario) throw new Error("Cenário fiscal local inválido no banco.");
  const favoritas = Array.isArray(registro.favorites)
    ? [...new Set(registro.favorites.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 1000)
    : [];
  return { cenario, favoritas, revisao: registro.revision };
}
