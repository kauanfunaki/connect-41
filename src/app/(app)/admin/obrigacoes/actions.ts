"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";

export type ObligationState = { error: string } | null;

export async function criarObrigacao(_prev: ObligationState, form: FormData): Promise<ObligationState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão." };

  const companyId = (form.get("companyId") as string)?.trim();
  const pipelineId = (form.get("pipelineId") as string)?.trim();
  const title = (form.get("title") as string)?.trim();
  const description = (form.get("description") as string)?.trim();
  const dayOfMonthRaw = (form.get("dayOfMonth") as string)?.trim();
  const responsibleId = (form.get("responsibleId") as string)?.trim();

  if (!companyId) return { error: "Empresa é obrigatória" };
  if (!pipelineId) return { error: "Kanban de destino é obrigatório" };
  if (!title) return { error: "Título é obrigatório" };
  const dayOfMonth = parseInt(dayOfMonthRaw);
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return { error: "Dia do mês precisa estar entre 1 e 31" };
  }

  const prisma = getPrisma();
  // sectorCode vem do pipeline (não do form) — garante consistência e evita
  // um setor forjado que não bate com o kanban de destino.
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, tenantId: ctx.tenantId, active: true },
  });
  if (!pipeline) return { error: "Kanban não encontrado." };

  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId: ctx.tenantId } });
  if (!company) return { error: "Empresa não encontrada." };

  if (responsibleId) {
    const user = await prisma.user.findFirst({ where: { id: responsibleId, tenantId: ctx.tenantId, active: true } });
    if (!user) return { error: "Responsável não encontrado." };
  }

  const obligation = await prisma.recurringObligation.create({
    data: {
      tenantId: ctx.tenantId,
      companyId,
      sectorCode: pipeline.sectorCode,
      pipelineId,
      title,
      description: description || null,
      dayOfMonth,
      responsibleId: responsibleId || null,
    },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "recurringObligation.create",
    entityType: "RecurringObligation",
    entityId: obligation.id,
    metadata: { title, companyId, dayOfMonth },
  });

  revalidatePath("/admin/obrigacoes");
  return null;
}

export async function alternarObrigacao(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;

  const prisma = getPrisma();
  const existing = await prisma.recurringObligation.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;

  await prisma.recurringObligation.update({ where: { id }, data: { active: !existing.active } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: existing.active ? "recurringObligation.disable" : "recurringObligation.enable",
    entityType: "RecurringObligation",
    entityId: id,
  });

  revalidatePath("/admin/obrigacoes");
}

export async function excluirObrigacao(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;

  const prisma = getPrisma();
  const existing = await prisma.recurringObligation.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;

  await prisma.recurringObligation.delete({ where: { id } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "recurringObligation.delete",
    entityType: "RecurringObligation",
    entityId: id,
    metadata: { title: existing.title },
  });

  revalidatePath("/admin/obrigacoes");
}
