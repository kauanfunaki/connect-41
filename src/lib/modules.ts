import { getPrisma } from "@/lib/prisma";
import { MODULE_CATALOG, getModuleDef, type ModuleDef } from "@/lib/module-catalog";
import { resolverSetorDoModulo } from "@/lib/modulo-setor";

// `sectorCode` já vem resolvido para o tenant (ver `src/lib/modulo-setor.ts`);
// `catalogSectorCode` é onde o módulo nasce, para a tela de admin mostrar que
// ele foi transferido.
export type ModuleState = ModuleDef & { enabled: boolean; catalogSectorCode: string };

// null = plano não restringe módulos (planos antigos, ou tenant sem
// assinatura configurada ainda) — nesse caso só o TenantModule/defaultEnabled
// decide, como antes desta coluna existir.
function parseAllowedModuleCodes(raw: unknown): Set<string> | null {
  if (!Array.isArray(raw)) return null;
  return new Set(raw.filter((c): c is string => typeof c === "string"));
}

async function getPlanAllowedModules(tenantId: string): Promise<Set<string> | null> {
  const prisma = getPrisma();
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { plan: { select: { allowedModuleCodes: true } } },
  });
  return parseAllowedModuleCodes(subscription?.plan.allowedModuleCodes);
}

// Todos os módulos do catálogo com o estado de ativação resolvido para o tenant.
// Dois portões independentes: o plano da assinatura é o TETO (o que o
// contrato comercial libera) e o TenantModule é o ajuste fino por tenant
// dentro desse teto (liga/desliga um módulo específico que o plano já
// permite) — nenhum dos dois consegue liberar o que o outro nega.
export async function getTenantModuleStates(tenantId: string): Promise<ModuleState[]> {
  if (MODULE_CATALOG.length === 0) return [];

  const prisma = getPrisma();
  const [rows, allowedByPlan] = await Promise.all([
    prisma.tenantModule.findMany({ where: { tenantId } }),
    getPlanAllowedModules(tenantId),
  ]);
  const overrides = new Map(rows.map((r) => [r.moduleCode, r]));

  return MODULE_CATALOG.map((m) => {
    const row = overrides.get(m.code);
    return {
      ...m,
      sectorCode: resolverSetorDoModulo(m.sectorCode, row?.sectorCode),
      catalogSectorCode: m.sectorCode,
      enabled: (allowedByPlan === null || allowedByPlan.has(m.code)) && (row?.enabled ?? m.defaultEnabled),
    };
  });
}

export async function getEnabledModuleCodes(tenantId: string): Promise<Set<string>> {
  const states = await getTenantModuleStates(tenantId);
  return new Set(states.filter((s) => s.enabled).map((s) => s.code));
}

export async function isModuleEnabled(tenantId: string, code: string): Promise<boolean> {
  const states = await getTenantModuleStates(tenantId);
  return states.find((s) => s.code === code)?.enabled ?? false;
}

/**
 * O setor que opera o módulo neste tenant — é o que o gate de cada tela deve
 * usar, no lugar de um `const SECTOR = "bpo"`. Módulo fora do catálogo devolve
 * `null`, e o chamador trata como não encontrado.
 *
 * Consulta só a linha do módulo, e não os estados todos: o gate roda em toda
 * página e em toda action.
 */
export async function setorDoModulo(tenantId: string, code: string): Promise<string | null> {
  const def = getModuleDef(code);
  if (!def) return null;
  const prisma = getPrisma();
  const row = await prisma.tenantModule.findUnique({
    where: { tenantId_moduleCode: { tenantId, moduleCode: code } },
    select: { sectorCode: true },
  });
  return resolverSetorDoModulo(def.sectorCode, row?.sectorCode);
}

// Setores que têm ao menos um módulo ativo para o tenant — usado pra sidebar não
// mostrar um setor sem nenhum módulo plugado nele.
export async function getSectorsWithEnabledModules(tenantId: string): Promise<Set<string>> {
  const states = await getTenantModuleStates(tenantId);
  return new Set(states.filter((s) => s.enabled).map((s) => s.sectorCode));
}

export async function setModuleEnabled(tenantId: string, code: string, enabled: boolean): Promise<void> {
  const prisma = getPrisma();
  await prisma.tenantModule.upsert({
    where: { tenantId_moduleCode: { tenantId, moduleCode: code } },
    create: { tenantId, moduleCode: code, enabled },
    update: { enabled },
  });
}

/**
 * Grava o setor que opera o módulo. `null` volta ao setor do catálogo.
 *
 * Na criação, `enabled` nasce com o padrão do catálogo: transferir um módulo que
 * nunca foi ligado nem desligado não pode, de carona, mudar se ele está ativo.
 */
export async function setModuleSector(tenantId: string, code: string, sectorCode: string | null): Promise<void> {
  const def = getModuleDef(code);
  if (!def) return;
  const prisma = getPrisma();
  await prisma.tenantModule.upsert({
    where: { tenantId_moduleCode: { tenantId, moduleCode: code } },
    create: { tenantId, moduleCode: code, enabled: def.defaultEnabled, sectorCode },
    update: { sectorCode },
  });
}
