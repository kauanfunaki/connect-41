import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { MODULO } from "./regras";
import { podeAbrir, podeGerenciar, podeOperar, type ConfigDeAcesso } from "./acesso";

export type Contexto = { ctx: AuthContext; config: ConfigDeAcesso };
export async function configDoHelpdesk(tenantId: string): Promise<ConfigDeAcesso> {
  const [enabled, sectorCode] = await Promise.all([isModuleEnabled(tenantId, MODULO), setorDoModulo(tenantId, MODULO)]);
  // Nenhuma tabela nova é consultada com o módulo desligado: a migração pode
  // ser publicada antes da ativação, sem afetar a navegação do escritório.
  if (!enabled || !sectorCode) return { enabled: false, sectorCode: sectorCode ?? "", requesterSectors: [] };
  const [setor, rows] = await Promise.all([
    getPrisma().sector.findFirst({ where: { tenantId, code: sectorCode, active: true } }),
    getPrisma().helpdeskRequesterSector.findMany({ where: { tenantId } }),
  ]);
  return { enabled: !!setor, sectorCode, requesterSectors: rows.map(r => r.sectorCode) };
}
export async function contexto(): Promise<Contexto> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) throw new Error("Sessão indisponível. Entre novamente.");
  const config = await configDoHelpdesk(ctx.tenantId);
  if (!config.enabled) throw new Error("O módulo de chamados não está disponível neste escritório.");
  return { ctx, config };
}
export function exigirEscrita(c: Contexto) { if (c.ctx.subscriptionReadOnly || c.ctx.role === "READONLY") throw new Error("Este acesso é somente leitura."); }
export function exigirAbertura(c: Contexto) { if (!podeAbrir(c.ctx, c.config)) throw new Error("Seu setor não está autorizado a abrir chamados."); }
export function exigirOperacao(c: Contexto) { if (!podeOperar(c.ctx, c.config)) throw new Error("Só a equipe do setor responsável pode atender chamados."); }
export function exigirGestao(c: Contexto) { if (!podeGerenciar(c.ctx, c.config)) throw new Error("Só o gestor responsável ou administrador pode realizar esta ação."); }
