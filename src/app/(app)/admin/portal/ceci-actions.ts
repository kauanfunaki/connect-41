"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { nomeExibicao } from "@/lib/companyName";
import { FALTA_ATUALIZAR_O_BANCO_DA_CECI } from "@/lib/portal/ceci";

export type ResultadoDaCeci = { ok: true } | { erro: string };

/**
 * Liga ou desliga a Ceci no portal para uma empresa (21/10/2026) —
 * Administração › Portal do cliente › Ceci. Ligada na matriz, vale para as
 * filiais que os acessos veem por ela.
 *
 * Só Administrador e Super Admin, como o resto do portal, e nunca com a
 * assinatura em somente leitura. A empresa tem de ser do escritório de quem
 * pede (`updateMany` com o `tenantId` no `where`: id de outro escritório não
 * acha linha). Cada troca vai para a auditoria.
 */
export async function definirCeciDaEmpresa(companyId: string, ligada: boolean): Promise<ResultadoDaCeci> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role) || ctx.subscriptionReadOnly) {
    return { erro: "Só o Administrador ou o Super Admin liga ou desliga a Ceci no portal." };
  }
  if (typeof companyId !== "string" || !companyId || typeof ligada !== "boolean") return { erro: "Empresa não encontrada." };

  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  let empresa: { name: string; displayName: string | null } | null;
  try {
    const r = await prisma.company.updateMany({ where: { id: companyId, tenantId }, data: { ceciNoPortal: ligada } });
    if (r.count === 0) return { erro: "Empresa não encontrada." };
    empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { name: true, displayName: true } });
  } catch (err) {
    if ((err as { code?: unknown })?.code === "P2022") return { erro: FALTA_ATUALIZAR_O_BANCO_DA_CECI };
    console.error("[admin/portal] ceci da empresa", err);
    return { erro: "Não foi possível salvar agora. Tente de novo em instantes." };
  }

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: ligada ? "portal.ceci.ligada" : "portal.ceci.desligada",
    entityType: "Company",
    entityId: companyId,
    metadata: { empresa: empresa ? nomeExibicao(empresa) : null },
  });
  revalidatePath("/admin/portal");
  return { ok: true };
}
