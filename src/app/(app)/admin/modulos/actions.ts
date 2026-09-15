"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { setModuleEnabled, setModuleSector } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { setorParaGravar } from "@/lib/modulo-setor";
import { getActiveSectors } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";

/**
 * Muda o setor que opera o módulo neste tenant.
 *
 * O setor tem de ser um setor **ativo** do tenant: o valor vem do navegador, e
 * um código inventado esconderia o módulo de todo mundo que não é admin, sem
 * nenhum setor na tela para desfazer.
 */
export async function transferirModulo(code: string, sectorCode: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;
  const def = getModuleDef(code);
  if (!def) return;

  const ativos = await getActiveSectors(ctx.tenantId);
  if (!ativos.some((s) => s.code === sectorCode)) return;

  await setModuleSector(ctx.tenantId, code, setorParaGravar(def.sectorCode, sectorCode));
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "module.transfer",
    entityType: "TenantModule",
    entityId: code,
    metadata: { to: sectorCode, catalog: def.sectorCode },
  });
  // O layout inteiro: a sidebar de todos os setores muda.
  revalidatePath("/", "layout");
}

export async function alternarModulo(code: string, enabled: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;
  if (!getModuleDef(code)) return;

  await setModuleEnabled(ctx.tenantId, code, enabled);
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: enabled ? "module.enable" : "module.disable",
    entityType: "TenantModule",
    entityId: code,
  });
  revalidatePath("/admin/modulos");
}
