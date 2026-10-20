"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, podeExcluir } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

export type EvaluationCycleState = { error: string } | null;

export async function criarCiclo(_prev: EvaluationCycleState, form: FormData): Promise<EvaluationCycleState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!(await podeNoModulo(ctx, "dp_avaliacoes", "gerir"))) return { error: "Sem permissão para criar ciclos de avaliação." };

  const name = (form.get("name") as string)?.trim();
  const startDateRaw = (form.get("startDate") as string)?.trim();
  const endDateRaw = (form.get("endDate") as string)?.trim();
  if (!name) return { error: "Nome do ciclo é obrigatório" };
  if (!startDateRaw) return { error: "Informe a data de início." };

  const prisma = getPrisma();
  let id: string;
  try {
    const cycle = await prisma.evaluationCycle.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        startDate: new Date(startDateRaw),
        endDate: endDateRaw ? new Date(endDateRaw) : null,
      },
    });
    id = cycle.id;
  } catch (err) {
    console.error("[criarCiclo]", err);
    return { error: "Erro ao criar ciclo de avaliação." };
  }

  redirect(`/avaliacoes/${id}`);
}

export async function encerrarCiclo(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await podeNoModulo(ctx, "dp_avaliacoes", "gerir"))) return;

  const prisma = getPrisma();
  const existing = await prisma.evaluationCycle.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;

  await prisma.evaluationCycle.update({ where: { id }, data: { active: false } });
  revalidatePath(`/avaliacoes/${id}`);
}

export async function excluirCiclo(id: string): Promise<void> {
  const ctx = await getAuthContext();
  // Excluir: só o administrador (13/10/2026). Era quem gere o módulo no setor.
  if (!ctx.tenantId || !podeExcluir(ctx) || !(await podeNoModulo(ctx, "dp_avaliacoes", "gerir"))) return;

  const prisma = getPrisma();
  const existing = await prisma.evaluationCycle.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;

  try {
    await prisma.evaluationCycle.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirCiclo]", err);
    return;
  }

  revalidatePath("/avaliacoes");
  redirect("/avaliacoes");
}

// ── Competências ─────────────────────────────────────────────────────────────
// Moram aqui desde 20/10/2026 (escolha 8A dos Ajustes de 15/10): eram uma tela
// das Configurações, só do administrador, longe de quem avalia. Agora são uma
// aba de Avaliações de desempenho, e quem cadastra e edita é quem gere o
// módulo no setor — o mesmo de abrir e encerrar ciclo. Excluir segue só do
// administrador, como o ciclo.

export type CompetencyState = { error: string } | null;

export async function criarCompetencia(_prev: CompetencyState, form: FormData): Promise<CompetencyState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!(await podeNoModulo(ctx, "dp_avaliacoes", "gerir"))) return { error: "Sem permissão para cadastrar competências." };

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

  revalidatePath("/avaliacoes");
  return null;
}

export async function atualizarCompetencia(_prev: CompetencyState, form: FormData): Promise<CompetencyState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!(await podeNoModulo(ctx, "dp_avaliacoes", "gerir"))) return { error: "Sem permissão para editar competências." };

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

  revalidatePath("/avaliacoes");
  return null;
}

export async function excluirCompetencia(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !podeExcluir(ctx) || !(await podeNoModulo(ctx, "dp_avaliacoes", "gerir"))) return;

  const prisma = getPrisma();
  const existing = await prisma.competency.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;

  // A nota dada prende a competência (a FK de `evaluation_scores` não
  // apaga em cascata); a tela nem oferece excluir a que está em uso.
  try {
    await prisma.competency.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirCompetencia]", err);
    return;
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "competency.delete", entityType: "Competency", entityId: id, metadata: { name: existing.name } });

  revalidatePath("/avaliacoes");
}
