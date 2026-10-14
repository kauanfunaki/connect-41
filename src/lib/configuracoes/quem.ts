import type { AuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import type { QuemConfigura } from "./areas";

/**
 * O que o menu das configurações precisa saber de quem está logado. Só o
 * administrador do escritório consulta o banco: é o único papel em que o modo
 * do escritório (autoatendimento tem "Minha assinatura") muda o menu.
 */
export async function quemConfigura(ctx: Pick<AuthContext, "role" | "sectors" | "tenantId">): Promise<QuemConfigura> {
  let autoatendimento = false;
  if (ctx.role === "ADMIN" && ctx.tenantId) {
    try {
      const tenant = await getPrisma().tenant.findUnique({ where: { id: ctx.tenantId }, select: { managementMode: true } });
      autoatendimento = tenant?.managementMode === "SELF_SERVICE";
    } catch (err) {
      // Sem o modo, o menu só não mostra "Minha assinatura" — a tela continua no endereço.
      console.error("[configuracoes] modo do escritório", err);
    }
  }
  return { role: ctx.role, setores: ctx.sectors.length, autoatendimento };
}
