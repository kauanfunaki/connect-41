"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { setModuleEnabled } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";

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
