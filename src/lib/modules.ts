import { getPrisma } from "@/lib/prisma";
import { MODULE_CATALOG, getModuleDef, type ModuleDef } from "@/lib/module-catalog";
import { resolverSetorDoModulo, resolverSetoresDoModulo } from "@/lib/modulo-setor";

// `sectorCode` já vem resolvido para o tenant (ver `src/lib/modulo-setor.ts`);
// `catalogSectorCode` é onde o módulo nasce, para a tela de admin mostrar que
// ele foi transferido.
//
// `sectorCodes` (21/10/2026): todos os setores da tela — o dono (`sectorCode`)
// primeiro, depois os que também usam. Menu, permissão e busca leem esta lista;
// o que é "do setor da tela" no singular (aviso, rótulo) segue no dono.
export type ModuleState = ModuleDef & { enabled: boolean; catalogSectorCode: string; sectorCodes: string[] };

/**
 * Os setores a mais de cada tela neste tenant (21/10/2026), por código da tela.
 *
 * Nunca derruba a tela: sem a tabela (deploy antes da migration) ou com o banco
 * fora, cada tela fica só no setor dono — o Connect de antes desta mudança.
 * `disponivel` diz à tela de configuração se dá para salvar.
 */
export async function lerSetoresLigados(
  tenantId: string,
  moduleCode?: string,
): Promise<{ porModulo: Map<string, string[]>; disponivel: boolean }> {
  const porModulo = new Map<string, string[]>();
  try {
    const linhas = await getPrisma().tenantModuleSector.findMany({
      where: moduleCode ? { tenantId, moduleCode } : { tenantId },
      select: { moduleCode: true, sectorCode: true },
      orderBy: { createdAt: "asc" },
    });
    for (const l of linhas) {
      const atual = porModulo.get(l.moduleCode);
      if (atual) atual.push(l.sectorCode);
      else porModulo.set(l.moduleCode, [l.sectorCode]);
    }
    return { porModulo, disponivel: true };
  } catch (err) {
    console.error("[modulos] leitura dos setores ligados", err);
    return { porModulo, disponivel: false };
  }
}

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
  const [rows, allowedByPlan, ligados] = await Promise.all([
    prisma.tenantModule.findMany({ where: { tenantId } }),
    getPlanAllowedModules(tenantId),
    lerSetoresLigados(tenantId),
  ]);
  const overrides = new Map(rows.map((r) => [r.moduleCode, r]));

  return MODULE_CATALOG.map((m) => {
    const row = overrides.get(m.code);
    const dono = resolverSetorDoModulo(m.sectorCode, row?.sectorCode);
    return {
      ...m,
      sectorCode: dono,
      sectorCodes: resolverSetoresDoModulo(dono, ligados.porModulo.get(m.code) ?? []),
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

/**
 * Todos os setores da tela neste tenant (21/10/2026): o dono primeiro, depois
 * os que também usam. É o que o gate de permissão usa — `canViewSector` e
 * companhia aceitam a lista e liberam quem alcança algum deles. Módulo fora
 * do catálogo devolve `null`, como `setorDoModulo`.
 *
 * Para aviso e rótulo ("o setor da tela") continua valendo `setorDoModulo`:
 * ligar a tela a outro setor não muda quem recebe notificação.
 */
export async function setoresDoModulo(tenantId: string, code: string): Promise<string[] | null> {
  const [dono, ligados] = await Promise.all([setorDoModulo(tenantId, code), lerSetoresLigados(tenantId, code)]);
  if (dono === null) return null;
  return resolverSetoresDoModulo(dono, ligados.porModulo.get(code) ?? []);
}

// Setores que têm ao menos um módulo ativo para o tenant — usado pra sidebar não
// mostrar um setor sem nenhum módulo plugado nele.
export async function getSectorsWithEnabledModules(tenantId: string): Promise<Set<string>> {
  const states = await getTenantModuleStates(tenantId);
  return new Set(states.filter((s) => s.enabled).flatMap((s) => s.sectorCodes));
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

/**
 * Grava os setores que também usam a tela (21/10/2026), trocando a lista
 * inteira. O dono nunca entra aqui — ele mora em `TenantModule.sectorCode` —,
 * então quem chama já tira o dono e os repetidos (ver `setoresParaLigar`).
 */
export async function setModuleSharedSectors(tenantId: string, code: string, sectorCodes: readonly string[]): Promise<void> {
  if (!getModuleDef(code)) return;
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.tenantModuleSector.deleteMany({ where: { tenantId, moduleCode: code } }),
    prisma.tenantModuleSector.createMany({ data: sectorCodes.map((sectorCode) => ({ tenantId, moduleCode: code, sectorCode })) }),
  ]);
}
