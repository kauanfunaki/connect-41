"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";

export type CompetencyState = { error: string } | null;

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

export async function criarCompetencia(_prev: CompetencyState, form: FormData): Promise<CompetencyState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para cadastrar competências." };

  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome da competência é obrigatório" };
  const description = (form.get("description") as string)?.trim() || null;

  const prisma = getPrisma();
  try {
    await prisma.competency.create({ data: { tenantId: ctx.tenantId, name, description } });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe uma competência "${name}".` };
    console.error("[criarCompetencia]", err);
    return { error: "Erro ao cadastrar competência." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "competency.create", entityType: "Competency", metadata: { name } });

  revalidatePath("/admin/competencias");
  return null;
}

export async function atualizarCompetencia(_prev: CompetencyState, form: FormData): Promise<CompetencyState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para editar competências." };

  const id = form.get("id") as string;
  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome da competência é obrigatório" };
  const description = (form.get("description") as string)?.trim() || null;

  const prisma = getPrisma();
  const existing = await prisma.competency.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return { error: "Competência não encontrada." };

  try {
    await prisma.competency.update({ where: { id }, data: { name, description } });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe uma competência "${name}".` };
    console.error("[atualizarCompetencia]", err);
    return { error: "Erro ao atualizar competência." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "competency.update", entityType: "Competency", entityId: id, metadata: { name } });

  revalidatePath("/admin/competencias");
  return null;
}

export async function excluirCompetencia(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;

  const prisma = getPrisma();
  const existing = await prisma.competency.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;

  try {
    await prisma.competency.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirCompetencia]", err);
    return;
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "competency.delete", entityType: "Competency", entityId: id, metadata: { name: existing.name } });

  revalidatePath("/admin/competencias");
}
