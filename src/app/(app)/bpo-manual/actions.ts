"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { sanitizeDocumentHtml } from "@/lib/clientDocuments";

const SECTOR = "bpo";

export type ManualPageState = { error: string } | null;

// Manual/Instruções do setor — página em branco (não é upload de arquivo),
// pensada como referência escrita pelos próprios colaboradores pra
// alinhamento interno (ex: cobertura em férias/ausência). Era por tarefa
// (CanvasPage.pipelineItemId) até 2026-07-24; virou biblioteca do setor
// (ver Backlog-Avaliacao-Atendimentos... não, ver histórico da sessão —
// motivo: ficava difícil de localizar dentro do detalhamento de uma tarefa
// específica).
export async function criarPaginaManual(titleRaw: string): Promise<{ error: string } | { id: string }> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  const title = titleRaw.trim();
  if (!tenantId || !userId) return { error: "Não autenticado" };
  if (!canActOnSector(ctx, SECTOR)) return { error: "Sem permissão para criar página." };
  if (!title) return { error: "Título é obrigatório" };

  const prisma = getPrisma();
  try {
    const page = await prisma.canvasPage.create({
      data: { tenantId, sectorCode: SECTOR, title, createdById: userId },
    });
    revalidatePath("/bpo-manual");
    return { id: page.id };
  } catch (err) {
    console.error("[criarPaginaManual]", err);
    return { error: "Erro ao criar página." };
  }
}

export async function atualizarPaginaManual(pageId: string, _prev: ManualPageState, form: FormData): Promise<ManualPageState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };
  if (!canActOnSector(ctx, SECTOR)) return { error: "Sem permissão para editar esta página." };

  const title = (form.get("title") as string)?.trim();
  if (!title) return { error: "Título é obrigatório" };
  const rawContent = (form.get("content") as string)?.trim() ?? "";
  const sanitized = rawContent ? sanitizeDocumentHtml(rawContent) : "";
  const content = sanitized.replace(/<[^>]+>/g, "").trim() ? sanitized : "";

  const prisma = getPrisma();
  try {
    await prisma.canvasPage.update({ where: { id: pageId, tenantId, sectorCode: SECTOR }, data: { title, content: content || null } });
  } catch (err) {
    console.error("[atualizarPaginaManual]", err);
    return { error: "Erro ao salvar página." };
  }

  revalidatePath("/bpo-manual");
  return null;
}

export async function excluirPaginaManual(pageId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId || !canManageSector(ctx, SECTOR)) return;

  const prisma = getPrisma();
  try {
    await prisma.canvasPage.delete({ where: { id: pageId, tenantId, sectorCode: SECTOR } });
  } catch (err) {
    console.error("[excluirPaginaManual]", err);
    return;
  }

  revalidatePath("/bpo-manual");
}
