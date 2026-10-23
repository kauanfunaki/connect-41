"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { lerDiasDoLembrete } from "@/lib/envios/lembrete";
import { FALTA_ATUALIZAR_O_BANCO_DOS_ENVIOS } from "@/lib/envios/lembretePadrao";

export type ResultadoDoLembretePadrao = { ok: true } | { erro: string };

/**
 * O lembrete de não lido padrão dos envios ao cliente (23/10/2026) —
 * Administração › Portal do cliente › Envios. O envio novo já vem com esse
 * prazo escolhido; quem envia ainda troca, envio a envio. Os envios que já
 * existem não mudam.
 *
 * Só Administrador e Super Admin, como o resto da configuração do portal, e
 * nunca com a assinatura em somente leitura. O valor é o do campo do
 * formulário do envio: "" é "sem lembrete"; fora de 2, 5 e 10 dias, recusa.
 */
export async function definirLembretePadraoDosEnvios(valor: string): Promise<ResultadoDoLembretePadrao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role) || ctx.subscriptionReadOnly) {
    return { erro: "Só o Administrador ou o Super Admin muda o padrão dos envios." };
  }
  if (typeof valor !== "string") return { erro: "Prazo inválido." };
  const dias = lerDiasDoLembrete(valor);
  if (dias === null && valor.trim() !== "") return { erro: "Prazo inválido." };

  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  let antes: number | null = null;
  try {
    antes = (await prisma.tenantEnviosConfig.findUnique({ where: { tenantId }, select: { lembreteDias: true } }))?.lembreteDias ?? null;
    await prisma.tenantEnviosConfig.upsert({
      where: { tenantId },
      create: { tenantId, lembreteDias: dias },
      update: { lembreteDias: dias },
    });
  } catch (err) {
    if (isPrismaMissingTableError(err)) return { erro: FALTA_ATUALIZAR_O_BANCO_DOS_ENVIOS };
    console.error("[admin/portal] lembrete padrão dos envios", err);
    return { erro: "Não foi possível salvar agora. Tente de novo em instantes." };
  }

  if (antes !== dias) {
    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: "clientDocument.reminder_default",
      entityType: "TenantEnviosConfig",
      entityId: tenantId,
      metadata: { antes, depois: dias },
    });
  }
  revalidatePath("/admin/portal");
  return { ok: true };
}
