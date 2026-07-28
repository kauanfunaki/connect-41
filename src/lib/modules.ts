import { getPrisma } from "@/lib/prisma";
import { MODULE_CATALOG, type ModuleDef } from "@/lib/module-catalog";

export type ModuleState = ModuleDef & { enabled: boolean };

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
  const overrides = new Map(rows.map((r) => [r.moduleCode, r.enabled]));

  return MODULE_CATALOG.map((m) => ({
    ...m,
    enabled: (allowedByPlan === null || allowedByPlan.has(m.code)) && (overrides.get(m.code) ?? m.defaultEnabled),
  }));
}

export async function getEnabledModuleCodes(tenantId: string): Promise<Set<string>> {
  const states = await getTenantModuleStates(tenantId);
  return new Set(states.filter((s) => s.enabled).map((s) => s.code));
}

export async function isModuleEnabled(tenantId: string, code: string): Promise<boolean> {
  const states = await getTenantModuleStates(tenantId);
  return states.find((s) => s.code === code)?.enabled ?? false;
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
