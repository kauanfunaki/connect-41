"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { logAudit } from "@/lib/audit";
import type { MeetingProvider } from "@/generated/prisma/enums";

export async function desconectarIntegracao(provider: MeetingProvider): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canManageMeetings(ctx)) return;

  const prisma = getPrisma();
  await prisma.oAuthAccount.deleteMany({ where: { tenantId: ctx.tenantId, userId: ctx.userId, provider } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "integration.disconnect",
    entityType: "OAuthAccount",
    metadata: { provider },
  });

  revalidatePath("/admin/integracoes");
}
