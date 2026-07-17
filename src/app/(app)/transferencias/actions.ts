"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import type { EntityType, HandoffPriority, HandoffSectorStatus } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { notifySector, notifyUser } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

export type HandoffState = { error: string } | null;

const PRIORITIES: HandoffPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const SECTOR_STATUSES: HandoffSectorStatus[] = ["NEW", "IN_PROGRESS", "DONE"];

// Cria UMA transferência com informações gerais (message/description, válidas
// para todos os setores) + uma instrução específica por setor de destino —
// formato do dia a dia no Acessórias, sem precisar abrir N transferências.
export async function criarHandoff(
  _prev: HandoffState,
  form: FormData
): Promise<HandoffState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };

  const entityType = form.get("entityType") as EntityType;
  const entityId = form.get("entityId") as string;
  const fromSector = (form.get("fromSector") as string)?.trim();
  const priorityRaw = (form.get("priority") as string) || "MEDIUM";
  const message = (form.get("message") as string)?.trim() || null;
  const description = (form.get("description") as string)?.trim() || null;
  const toSectors = Array.from(new Set(form.getAll("toSectors").map((s) => String(s).trim()).filter(Boolean)));

  if (!entityId || !entityType) return { error: "Entidade inválida." };
  if (!fromSector) return { error: "Selecione o setor de origem." };
  if (toSectors.length === 0) return { error: "Selecione pelo menos um setor de destino." };
  if (toSectors.includes(fromSector)) return { error: "O setor de origem não pode estar entre os destinos." };
  if (!PRIORITIES.includes(priorityRaw as HandoffPriority)) return { error: "Prioridade inválida." };
  const priority = priorityRaw as HandoffPriority;
  if (!canManageSector(ctx, fromSector)) {
    return { error: "Sem permissão para solicitar transferência a partir deste setor." };
  }

  const prisma = getPrisma();

  // Setores de destino precisam existir e estar ativos no tenant.
  const validSectors = await prisma.sector.findMany({
    where: { tenantId: ctx.tenantId, code: { in: toSectors }, active: true },
    select: { code: true },
  });
  if (validSectors.length !== toSectors.length) return { error: "Setor de destino inválido." };

  // Confere que a entidade está dentro do escopo de quem solicita.
  const scope = entityType === "COMPANY" ? await scopedCompanyWhere(ctx) : await scopedPersonWhere(ctx);
  const entity =
    entityType === "COMPANY"
      ? await prisma.company.findFirst({ where: { id: entityId, ...scope } })
      : await prisma.person.findFirst({ where: { id: entityId, ...scope } });
  if (!entity) return { error: "Empresa/Pessoa não encontrada ou fora do seu escopo." };

  let handoffId: string;
  try {
    const created = await prisma.handoff.create({
      data: {
        tenantId: ctx.tenantId,
        fromSector,
        entityType,
        entityId,
        requestedBy: ctx.userId,
        message,
        description,
        priority,
        sectors: {
          create: toSectors.map((sectorCode) => ({
            tenantId: ctx.tenantId,
            sectorCode,
            instruction: (form.get(`instruction_${sectorCode}`) as string)?.trim() || null,
          })),
        },
      },
    });
    handoffId = created.id;
  } catch (err) {
    console.error("[criarHandoff]", err);
    return { error: "Erro ao solicitar transferência. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "handoff.create",
    entityType: "Handoff",
    entityId: handoffId,
    metadata: { fromSector, toSectors, priority },
  });

  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);
  await Promise.all(
    toSectors.map((sectorCode) =>
      notifySector(sectorCode, {
        tenantId: ctx.tenantId,
        type: "HANDOFF_RECEIVED",
        message: `Nova transferência de ${sectorLabels[fromSector] ?? fromSector} para "${entity.name}"`,
        entityType,
        entityId,
      })
    )
  );

  revalidatePath("/transferencias");
  redirect("/transferencias");
}

export type HandoffActionResult = { error: string } | null;

// Atualiza a situação da transferência PARA UM SETOR (Nova / Resolvendo /
// Finalizada). Pode mudar: a coordenação do setor (canManageSector) ou o
// colaborador designado como responsável daquela instrução.
export async function atualizarStatusSetor(
  handoffSectorId: string,
  status: HandoffSectorStatus
): Promise<HandoffActionResult> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado." };
  if (!SECTOR_STATUSES.includes(status)) return { error: "Situação inválida." };

  const prisma = getPrisma();
  const sector = await prisma.handoffSector.findFirst({
    where: { id: handoffSectorId, tenantId: ctx.tenantId },
    include: { handoff: { select: { id: true, requestedBy: true, entityType: true, entityId: true } } },
  });
  if (!sector) return { error: "Transferência não encontrada." };

  const allowed = canManageSector(ctx, sector.sectorCode) || sector.assignedTo === ctx.userId;
  if (!allowed || ctx.role === "READONLY") {
    return { error: "Sem permissão para atualizar a situação deste setor." };
  }

  try {
    await prisma.handoffSector.update({
      where: { id: sector.id },
      data: { status, resolvedAt: status === "DONE" ? new Date() : null },
    });
  } catch (err) {
    console.error("[atualizarStatusSetor]", err);
    return { error: "Erro ao atualizar a situação. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "handoff.sector.status",
    entityType: "Handoff",
    entityId: sector.handoff.id,
    metadata: { sectorCode: sector.sectorCode, status },
  });

  if (status === "DONE" && sector.handoff.requestedBy !== ctx.userId) {
    const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);
    await notifyUser(sector.handoff.requestedBy, {
      tenantId: ctx.tenantId,
      type: "HANDOFF_SECTOR_DONE",
      message: `${sectorLabels[sector.sectorCode] ?? sector.sectorCode} finalizou a parte dele na sua transferência`,
      entityType: sector.handoff.entityType,
      entityId: sector.handoff.entityId,
    });
  }

  revalidatePath(`/transferencias/${sector.handoff.id}`);
  revalidatePath("/transferencias");
  return null;
}

// Designa (ou remove) o responsável pela instrução de um setor. Restrito à
// coordenação do setor, e o designado precisa ser DO PRÓPRIO setor (a
// coordenadora do Fiscal designa alguém do Fiscal, nunca de outro setor) —
// ADMIN/SUPER_ADMIN também são elegíveis, pois gerenciam todos os setores.
export async function atribuirResponsavelSetor(
  handoffSectorId: string,
  userId: string | null
): Promise<HandoffActionResult> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };

  const prisma = getPrisma();
  const sector = await prisma.handoffSector.findFirst({
    where: { id: handoffSectorId, tenantId: ctx.tenantId },
    include: { handoff: { select: { id: true, entityType: true, entityId: true } } },
  });
  if (!sector) return { error: "Transferência não encontrada." };
  if (!canManageSector(ctx, sector.sectorCode)) {
    return { error: "Sem permissão para atribuir responsável neste setor." };
  }

  if (userId) {
    const assignee = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId: ctx.tenantId,
        active: true,
        OR: [{ role: { in: ["SUPER_ADMIN", "ADMIN"] } }, { sectors: { some: { sectorCode: sector.sectorCode } } }],
      },
      select: { id: true },
    });
    if (!assignee) return { error: "O responsável precisa ser um membro deste setor." };
  }

  try {
    await prisma.handoffSector.update({ where: { id: sector.id }, data: { assignedTo: userId } });
  } catch (err) {
    console.error("[atribuirResponsavelSetor]", err);
    return { error: "Erro ao atribuir responsável. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "handoff.sector.assign",
    entityType: "Handoff",
    entityId: sector.handoff.id,
    metadata: { sectorCode: sector.sectorCode, assignedTo: userId },
  });

  if (userId && userId !== ctx.userId) {
    await notifyUser(userId, {
      tenantId: ctx.tenantId,
      type: "HANDOFF_ASSIGNED",
      message: "Você foi definido como responsável por uma transferência",
      entityType: sector.handoff.entityType,
      entityId: sector.handoff.entityId,
    });
  }

  revalidatePath(`/transferencias/${sector.handoff.id}`);
  return null;
}

export async function registrarVisualizacao(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;

  const prisma = getPrisma();
  await prisma.handoffView.upsert({
    where: { handoffId_userId: { handoffId: id, userId: ctx.userId } },
    create: { tenantId: ctx.tenantId, handoffId: id, userId: ctx.userId },
    update: { viewedAt: new Date() },
  });
}
