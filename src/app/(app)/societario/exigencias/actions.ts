"use server";

// O prazo para cobrar o órgão do protocolo parado (lote 5, 28/10/2026). Só
// quem administra o setor muda; a action confere de novo — Server Function
// aceita POST direto.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canManageSector } from "@/lib/auth/papeis";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { lerDiasDaCobranca } from "@/lib/societario/protocoloParado";

const MODULO = "societario_prazos";

export async function definirCobrancaDoProtocolo(valor: unknown): Promise<{ ok: true } | { erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, MODULO))) return { erro: "Sem acesso." };
  if (ctx.subscriptionReadOnly || !canManageSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULO)) ?? "societario")) {
    return { erro: "Só quem administra o Societário muda o prazo de cobrança." };
  }
  const dias = lerDiasDaCobranca(valor);
  if (dias === null) return { erro: "Prazo inválido." };

  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  let antes: number | null = null;
  try {
    antes = (await prisma.tenantSocietarioConfig.findUnique({ where: { tenantId }, select: { cobrarProtocoloAposDias: true } }))?.cobrarProtocoloAposDias ?? null;
    await prisma.tenantSocietarioConfig.upsert({ where: { tenantId }, create: { tenantId, cobrarProtocoloAposDias: dias }, update: { cobrarProtocoloAposDias: dias } });
  } catch (err) {
    if (isPrismaMissingTableError(err)) return { erro: "Falta a atualização do banco para guardar o prazo. Até lá, vale o padrão." };
    console.error("[societário] prazo de cobrança do protocolo", err);
    return { erro: "Não foi possível salvar agora. Tente de novo em instantes." };
  }
  if (antes !== dias) {
    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: "societario.cobranca_de_protocolo",
      entityType: "TenantSocietarioConfig",
      entityId: tenantId,
      metadata: { antes, depois: dias },
    });
  }
  revalidatePath("/societario/exigencias");
  return { ok: true };
}
