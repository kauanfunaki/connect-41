"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { cancelarTarefa } from "@/lib/robo/servidor";

const MODULE = "societario_licencas";

/** Tira da fila do robô uma tarefa que a máquina ainda não pegou. */
export async function cancelarTarefaDoRobo(id: string): Promise<{ error: string } | { success: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? "societario")) return { error: "Sem permissão no Societário." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { error: "O módulo de licenças não está ligado." };
  const r = await cancelarTarefa(ctx.tenantId, id, ctx.userId ?? null);
  if (!r.ok) return { error: r.erro };
  revalidatePath("/societario/robo");
  return { success: true };
}
