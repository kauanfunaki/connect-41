"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { isPrismaMissingTableError, isPrismaUniqueError } from "@/lib/prismaErrors";
import { TELAS_DO_PORTAL, telaBloqueavel } from "@/lib/portal/telas";
import { FALTA_ATUALIZAR_O_BANCO } from "@/lib/portal/telasLiberadas";

export type ResultadoDaTela = { ok: true } | { erro: string };

/**
 * Libera ou bloqueia uma tela do portal para todos os clientes do escritório
 * (14/10/2026) — Administração › Portal do cliente › Telas liberadas.
 *
 * Só Administrador e Super Admin, como o resto da configuração do portal, e
 * nunca com a assinatura em somente leitura. O escritório é o de quem pede
 * (`ctx.tenantId`): o navegador manda só o endereço da tela, conferido contra
 * o catálogo — endereço inventado, ou o Início, não grava nada.
 *
 * Bloquear grava uma linha; liberar apaga. Repetir o pedido não muda nada (o
 * `upsert`, e o `deleteMany` que não acha linha).
 */
export async function definirTelaDoPortal(href: string, liberada: boolean): Promise<ResultadoDaTela> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role) || ctx.subscriptionReadOnly) {
    return { erro: "Só o Administrador ou o Super Admin libera ou bloqueia telas do portal." };
  }
  if (typeof href !== "string" || typeof liberada !== "boolean") return { erro: "Tela não encontrada." };
  const tela = TELAS_DO_PORTAL.find((t) => t.href === href);
  if (!tela) return { erro: "Tela não encontrada." };
  if (!telaBloqueavel(href)) return { erro: `${tela.rotulo} fica sempre liberada.` };

  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  try {
    if (liberada) {
      await prisma.portalTelaBloqueada.deleteMany({ where: { tenantId, href } });
    } else {
      await prisma.portalTelaBloqueada.upsert({
        where: { tenantId_href: { tenantId, href } },
        create: { tenantId, href },
        update: {},
      });
    }
  } catch (err) {
    if (isPrismaMissingTableError(err)) return { erro: FALTA_ATUALIZAR_O_BANCO };
    // Dois cliques ao mesmo tempo bloqueando a mesma tela: a outra gravou.
    if (!isPrismaUniqueError(err)) {
      console.error("[admin/portal] tela do portal", err);
      return { erro: "Não foi possível salvar agora. Tente de novo em instantes." };
    }
  }

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: liberada ? "portal.tela.liberada" : "portal.tela.bloqueada",
    entityType: "PortalTelaBloqueada",
    entityId: href,
    metadata: { tela: tela.rotulo, endereco: href },
  });
  revalidatePath("/admin/portal");
  return { ok: true };
}
