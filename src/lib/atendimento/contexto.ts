// A sessão e a configuração de acesso do Atendimento, para telas e ações.

import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { MODULO } from "./regras";
import type { ConfigDeAcesso } from "./acesso";

export type Contexto = { ctx: AuthContext; cfg: ConfigDeAcesso };

/**
 * O módulo ligado e o setor da triagem. Com o módulo desligado nenhuma tabela
 * do Atendimento é lida: a migration pode ir para produção antes de alguém
 * ligar o módulo.
 */
export async function configDoAtendimento(tenantId: string): Promise<ConfigDeAcesso> {
  const [enabled, triagem] = await Promise.all([isModuleEnabled(tenantId, MODULO), setorDoModulo(tenantId, MODULO)]);
  if (!enabled || !triagem) return { enabled: false, triagem: triagem ?? "" };
  const setor = await getPrisma().sector.findFirst({ where: { tenantId, code: triagem, active: true }, select: { id: true } });
  return { enabled: !!setor, triagem };
}

/** Para ações: sessão válida e módulo ligado, ou erro com a frase para a tela. */
export async function contexto(): Promise<Contexto> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) throw new Error("Sessão indisponível. Entre novamente.");
  const cfg = await configDoAtendimento(ctx.tenantId);
  if (!cfg.enabled) throw new Error("O Atendimento não está ligado neste escritório.");
  return { ctx, cfg };
}

/** Para telas: o mesmo, mas `null` em vez de erro (a tela responde 404). */
export async function contextoDaTela(): Promise<Contexto | null> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return null;
  const cfg = await configDoAtendimento(ctx.tenantId);
  return cfg.enabled ? { ctx, cfg } : null;
}
