"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import type { EntityType } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { notifySector, notifyUser } from "@/lib/notifications";

export type HandoffState = { error: string } | null;

export async function criarHandoff(
  _prev: HandoffState,
  form: FormData
): Promise<HandoffState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };

  const entityType = form.get("entityType") as EntityType;
  const entityId = form.get("entityId") as string;
  const fromSector = (form.get("fromSector") as string)?.trim();
  const toSector = (form.get("toSector") as string)?.trim();
  const message = (form.get("message") as string)?.trim() || null;

  if (!entityId || !entityType) return { error: "Entidade inválida." };
  if (!fromSector || !toSector) return { error: "Selecione o setor de origem e o de destino." };
  if (fromSector === toSector) return { error: "Origem e destino devem ser setores diferentes." };
  if (!canManageSector(ctx, fromSector)) {
    return { error: "Sem permissão para solicitar handoff a partir deste setor." };
  }

  const prisma = getPrisma();

  // Confere que a entidade está dentro do escopo de quem solicita.
  const scope = entityType === "COMPANY" ? await scopedCompanyWhere(ctx) : await scopedPersonWhere(ctx);
  const entity =
    entityType === "COMPANY"
      ? await prisma.company.findFirst({ where: { id: entityId, ...scope } })
      : await prisma.person.findFirst({ where: { id: entityId, ...scope } });
  if (!entity) return { error: "Empresa/Pessoa não encontrada ou fora do seu escopo." };

  try {
    await prisma.handoff.create({
      data: {
        tenantId: ctx.tenantId,
        fromSector,
        toSector,
        entityType,
        entityId,
        requestedBy: ctx.userId,
        message,
      },
    });
  } catch (err) {
    console.error("[criarHandoff]", err);
    return { error: "Erro ao solicitar transferência. Tente novamente." };
  }

  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);
  await notifySector(toSector, {
    tenantId: ctx.tenantId,
    type: "HANDOFF_RECEIVED",
    message: `Nova transferência de ${sectorLabels[fromSector] ?? fromSector} para "${entity.name}"`,
    entityType,
    entityId,
  });

  revalidatePath("/transferencias");
  redirect("/transferencias");
}

export type HandoffActionResult = { error: string } | null;

export async function aceitarHandoff(id: string): Promise<HandoffActionResult> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };

  const prisma = getPrisma();
  const handoff = await prisma.handoff.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!handoff || handoff.status !== "PENDING") {
    return { error: "Esta transferência já foi resolvida por outra pessoa." };
  }
  if (!canManageSector(ctx, handoff.toSector)) {
    return { error: "Sem permissão para aceitar transferências deste setor." };
  }

  try {
    await prisma.handoff.update({
      where: { id },
      data: { status: "ACCEPTED", resolvedAt: new Date() },
    });
  } catch (err) {
    console.error("[aceitarHandoff]", err);
    return { error: "Erro ao aceitar transferência. Tente novamente." };
  }

  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);
  await notifyUser(handoff.requestedBy, {
    tenantId: ctx.tenantId,
    type: "HANDOFF_ACCEPTED",
    message: `${sectorLabels[handoff.toSector] ?? handoff.toSector} aceitou sua transferência`,
    entityType: handoff.entityType,
    entityId: handoff.entityId,
  });

  revalidatePath("/transferencias");
  return null;
}

export async function rejeitarHandoff(id: string): Promise<HandoffActionResult> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };

  const prisma = getPrisma();
  const handoff = await prisma.handoff.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!handoff || handoff.status !== "PENDING") {
    return { error: "Esta transferência já foi resolvida por outra pessoa." };
  }
  if (!canManageSector(ctx, handoff.toSector)) {
    return { error: "Sem permissão para rejeitar transferências deste setor." };
  }

  try {
    await prisma.handoff.update({
      where: { id },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
  } catch (err) {
    console.error("[rejeitarHandoff]", err);
    return { error: "Erro ao rejeitar transferência. Tente novamente." };
  }

  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);
  await notifyUser(handoff.requestedBy, {
    tenantId: ctx.tenantId,
    type: "HANDOFF_REJECTED",
    message: `${sectorLabels[handoff.toSector] ?? handoff.toSector} rejeitou sua transferência`,
    entityType: handoff.entityType,
    entityId: handoff.entityId,
  });

  revalidatePath("/transferencias");
  return null;
}
