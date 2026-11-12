import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled, setorDoModulo, setoresDoModulo } from "@/lib/modules";
import { MODULO } from "./regras";
import { podeAbrir, podeGerenciar, podeGerenciarNo, podeOperarNo, type ConfigDeAcesso } from "./acesso";

export type Contexto = { ctx: AuthContext; config: ConfigDeAcesso };
export async function configDoHelpdesk(tenantId: string): Promise<ConfigDeAcesso> {
  const [enabled, sectorCode, todos] = await Promise.all([isModuleEnabled(tenantId, MODULO), setorDoModulo(tenantId, MODULO), setoresDoModulo(tenantId, MODULO)]);
  // Nenhuma tabela nova é consultada com o módulo desligado: a migração pode
  // ser publicada antes da ativação, sem afetar a navegação do escritório.
  if (!enabled || !sectorCode) return { enabled: false, sectorCode: sectorCode ?? "", sectorCodes: [] };
  // Os setores que administram (12/11/2026): os do módulo que estão ativos, o
  // dono primeiro. Sem o dono ativo, o módulo fica indisponível, como antes.
  const candidatos = todos?.length ? todos : [sectorCode];
  const ativos = new Set((await getPrisma().sector.findMany({ where: { tenantId, code: { in: candidatos }, active: true }, select: { code: true } })).map(s => s.code));
  return { enabled: ativos.has(sectorCode), sectorCode, sectorCodes: candidatos.filter(s => ativos.has(s)) };
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
export function exigirOperacao(c: Contexto, setor: string) { if (!podeOperarNo(c.ctx, c.config, setor)) throw new Error("Só a equipe do setor que atende o chamado pode atendê-lo."); }
export function exigirGestao(c: Contexto) { if (!podeGerenciar(c.ctx, c.config)) throw new Error("Só o gestor responsável ou administrador pode realizar esta ação."); }
export function exigirGestaoNo(c: Contexto, setor: string) { if (!podeGerenciarNo(c.ctx, c.config, setor)) throw new Error("Só o gestor do setor que atende o chamado ou o administrador pode realizar esta ação."); }
