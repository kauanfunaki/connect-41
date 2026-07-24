"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { logAudit } from "@/lib/audit";

const SECTOR = "recrutamento";
const MAX_QUESTIONS = 50;

export type TemplateState = { error: string } | null;

type ParsedQuestion = { text: string; options: string[]; correctIndex: number };

// Perguntas chegam como campos indexados (mesmo mecanismo de dependentes na
// admissão digital): q_count, q_text_0/q_options_0(JSON)/q_correct_0, etc.
function parseQuestions(form: FormData): ParsedQuestion[] | { error: string } {
  const count = parseInt((form.get("q_count") as string) ?? "0", 10) || 0;
  if (count === 0) return { error: "Adicione ao menos uma pergunta." };
  if (count > MAX_QUESTIONS) return { error: `Máximo de ${MAX_QUESTIONS} perguntas por modelo.` };

  const questions: ParsedQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const text = ((form.get(`q_text_${i}`) as string) ?? "").trim();
    if (!text) return { error: `Pergunta ${i + 1}: texto é obrigatório.` };

    let options: unknown;
    try {
      options = JSON.parse((form.get(`q_options_${i}`) as string) ?? "[]");
    } catch {
      return { error: `Pergunta ${i + 1}: alternativas inválidas.` };
    }
    if (!Array.isArray(options) || options.length < 2 || options.some((o) => typeof o !== "string" || !o.trim())) {
      return { error: `Pergunta ${i + 1}: informe ao menos 2 alternativas preenchidas.` };
    }

    const correctIndex = parseInt((form.get(`q_correct_${i}`) as string) ?? "-1", 10);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      return { error: `Pergunta ${i + 1}: marque a alternativa correta.` };
    }

    questions.push({ text, options: options as string[], correctIndex });
  }
  return questions;
}

export async function criarTemplate(_prev: TemplateState, form: FormData): Promise<TemplateState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canManageSector(ctx, SECTOR)) return { error: "Sem permissão para criar modelos de teste." };

  const name = ((form.get("name") as string) ?? "").trim();
  const description = ((form.get("description") as string) ?? "").trim();
  if (!name) return { error: "Nome do modelo é obrigatório." };

  const parsed = parseQuestions(form);
  if ("error" in parsed) return parsed;

  const prisma = getPrisma();
  let templateId: string;
  try {
    templateId = await prisma.$transaction(async (tx) => {
      const template = await tx.assessmentTemplate.create({
        data: {
          tenantId: ctx.tenantId,
          sectorCode: SECTOR,
          name,
          description: description || null,
          createdById: ctx.userId,
        },
      });
      await tx.assessmentTemplateQuestion.createMany({
        data: parsed.map((q, order) => ({
          tenantId: ctx.tenantId,
          templateId: template.id,
          order,
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
        })),
      });
      return template.id;
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe um modelo "${name}".` };
    console.error("[criarTemplate]", err);
    return { error: "Erro ao criar o modelo. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "assessmentTemplate.create",
    entityType: "AssessmentTemplate",
    entityId: templateId,
    metadata: { name, questionCount: parsed.length },
  });

  revalidatePath("/testes/templates");
  redirect("/testes/templates");
}

export async function atualizarTemplate(_prev: TemplateState, form: FormData): Promise<TemplateState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };

  const id = form.get("id") as string;
  const prisma = getPrisma();
  const existing = await prisma.assessmentTemplate.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return { error: "Modelo não encontrado." };
  if (!canManageSector(ctx, existing.sectorCode)) return { error: "Sem permissão para editar este modelo." };

  const name = ((form.get("name") as string) ?? "").trim();
  const description = ((form.get("description") as string) ?? "").trim();
  if (!name) return { error: "Nome do modelo é obrigatório." };

  const parsed = parseQuestions(form);
  if ("error" in parsed) return parsed;

  try {
    await prisma.$transaction([
      prisma.assessmentTemplate.update({ where: { id }, data: { name, description: description || null } }),
      prisma.assessmentTemplateQuestion.deleteMany({ where: { templateId: id } }),
      prisma.assessmentTemplateQuestion.createMany({
        data: parsed.map((q, order) => ({
          tenantId: ctx.tenantId,
          templateId: id,
          order,
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
        })),
      }),
    ]);
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe um modelo "${name}".` };
    console.error("[atualizarTemplate]", err);
    return { error: "Erro ao atualizar o modelo." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "assessmentTemplate.update",
    entityType: "AssessmentTemplate",
    entityId: id,
    metadata: { name, questionCount: parsed.length },
  });

  revalidatePath("/testes/templates");
  redirect("/testes/templates");
}

// Só permitido quando nenhum AssessmentLink referencia o modelo — a lista já
// só oferece este botão nesse caso (ver templates/page.tsx); modelo em uso
// usa alternarAtivoTemplate (arquivar) em vez de excluir.
export async function excluirTemplate(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;

  const prisma = getPrisma();
  const existing = await prisma.assessmentTemplate.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing || !canManageSector(ctx, existing.sectorCode)) return;

  const usageCount = await prisma.assessmentLink.count({ where: { templateId: id } });
  if (usageCount > 0) return;

  try {
    await prisma.assessmentTemplate.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirTemplate]", err);
    return;
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "assessmentTemplate.delete",
    entityType: "AssessmentTemplate",
    entityId: id,
    metadata: { name: existing.name },
  });

  revalidatePath("/testes/templates");
}

// Arquivar/reativar — não afeta links já criados (o link mantém o
// templateId; só o dropdown de "novo teste" para de oferecer o modelo).
export async function alternarAtivoTemplate(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;

  const prisma = getPrisma();
  const existing = await prisma.assessmentTemplate.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing || !canManageSector(ctx, existing.sectorCode)) return;

  await prisma.assessmentTemplate.update({ where: { id }, data: { active: !existing.active } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: existing.active ? "assessmentTemplate.archive" : "assessmentTemplate.unarchive",
    entityType: "AssessmentTemplate",
    entityId: id,
  });

  revalidatePath("/testes/templates");
  revalidatePath("/testes");
}
