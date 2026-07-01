import { getPrisma } from "@/lib/prisma";
import { MODULE_CATALOG, type ModuleDef } from "@/lib/module-catalog";

export type ModuleState = ModuleDef & { enabled: boolean };

// Todos os módulos do catálogo com o estado de ativação resolvido para o tenant
// (linha em TenantModule se existir, senão o defaultEnabled do catálogo).
export async function getTenantModuleStates(tenantId: string): Promise<ModuleState[]> {
  if (MODULE_CATALOG.length === 0) return [];

  const prisma = getPrisma();
  const rows = await prisma.tenantModule.findMany({ where: { tenantId } });
  const overrides = new Map(rows.map((r) => [r.moduleCode, r.enabled]));

  return MODULE_CATALOG.map((m) => ({
    ...m,
    enabled: overrides.get(m.code) ?? m.defaultEnabled,
  }));
}

export async function getEnabledModuleCodes(tenantId: string): Promise<Set<string>> {
  const states = await getTenantModuleStates(tenantId);
  return new Set(states.filter((s) => s.enabled).map((s) => s.code));
}

export async function isModuleEnabled(tenantId: string, code: string): Promise<boolean> {
  const def = MODULE_CATALOG.find((m) => m.code === code);
  if (!def) return false;

  const prisma = getPrisma();
  const row = await prisma.tenantModule.findUnique({
    where: { tenantId_moduleCode: { tenantId, moduleCode: code } },
  });
  return row?.enabled ?? def.defaultEnabled;
}

// Setores que têm ao menos um módulo ativo para o tenant — usado pra sidebar não
// mostrar um setor sem nenhum módulo plugado nele.
export async function getSectorsWithEnabledModules(tenantId: string): Promise<Set<string>> {
  const enabled = await getEnabledModuleCodes(tenantId);
  const sectors = new Set<string>();
  for (const m of MODULE_CATALOG) {
    if (enabled.has(m.code)) sectors.add(m.sectorCode);
  }
  return sectors;
}

export async function setModuleEnabled(tenantId: string, code: string, enabled: boolean): Promise<void> {
  const prisma = getPrisma();
  await prisma.tenantModule.upsert({
    where: { tenantId_moduleCode: { tenantId, moduleCode: code } },
    create: { tenantId, moduleCode: code, enabled },
    update: { enabled },
  });
}
