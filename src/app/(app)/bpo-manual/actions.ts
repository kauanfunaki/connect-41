"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { sanitizeDocumentHtml } from "@/lib/clientDocuments";

const SECTOR = "bpo";

export type ManualPageState = { error: string } | null;

// Manual/Instruções do setor — biblioteca em dois níveis (Documento > Página),
// escrita pelos próprios colaboradores (não upload de arquivo) pra
// alinhamento em caso de ausência/férias de alguém. Virou módulo próprio em
// 2026-07-24 (antes vivia dentro do detalhamento de uma tarefa via
// CanvasModal); a estrutura de dois níveis veio na sequência, já que só dava
// pra criar páginas dentro de uma coleção única (nenhum jeito de começar um
// segundo "documento").
export async function criarDocumentoManual(titleRaw: string): Promise<{ error: string } | { id: string }> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  const title = titleRaw.trim();
  if (!tenantId || !userId) return { error: "Não autenticado" };
  if (!canActOnSector(ctx, SECTOR)) return { error: "Sem permissão para criar documento." };
  if (!title) return { error: "Título é obrigatório" };

  const prisma = getPrisma();
  try {
    const doc = await prisma.manualDocument.create({
      data: { tenantId, sectorCode: SECTOR, title, createdById: userId },
    });
    revalidatePath("/bpo-manual");
    return { id: doc.id };
  } catch (err) {
    console.error("[criarDocumentoManual]", err);
    return { error: "Erro ao criar documento." };
  }
}

export async function renomearDocumentoManual(documentId: string, titleRaw: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  const title = titleRaw.trim();
  if (!tenantId || !title || !canActOnSector(ctx, SECTOR)) return;

  const prisma = getPrisma();
  try {
    await prisma.manualDocument.update({ where: { id: documentId, tenantId, sectorCode: SECTOR }, data: { title } });
  } catch (err) {
    console.error("[renomearDocumentoManual]", err);
    return;
  }

  revalidatePath("/bpo-manual");
}

export async function excluirDocumentoManual(documentId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId || !canManageSector(ctx, SECTOR)) return;

  const prisma = getPrisma();
  try {
    await prisma.manualDocument.delete({ where: { id: documentId, tenantId, sectorCode: SECTOR } });
  } catch (err) {
    console.error("[excluirDocumentoManual]", err);
    return;
  }

  revalidatePath("/bpo-manual");
}

export async function criarPaginaManual(documentId: string, titleRaw: string): Promise<{ error: string } | { id: string }> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  const title = titleRaw.trim();
  if (!tenantId || !userId) return { error: "Não autenticado" };
  if (!canActOnSector(ctx, SECTOR)) return { error: "Sem permissão para criar página." };
  if (!title) return { error: "Título é obrigatório" };

  const prisma = getPrisma();
  const doc = await prisma.manualDocument.findFirst({ where: { id: documentId, tenantId, sectorCode: SECTOR }, select: { id: true } });
  if (!doc) return { error: "Documento não encontrado." };

  try {
    const lastPage = await prisma.manualPage.findFirst({ where: { documentId }, orderBy: { order: "desc" }, select: { order: true } });
    const page = await prisma.manualPage.create({
      data: { tenantId, documentId, title, createdById: userId, order: (lastPage?.order ?? -1) + 1 },
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
    await prisma.manualPage.update({ where: { id: pageId, tenantId }, data: { title, content: content || null } });
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
    await prisma.manualPage.delete({ where: { id: pageId, tenantId } });
  } catch (err) {
    console.error("[excluirPaginaManual]", err);
    return;
  }

  revalidatePath("/bpo-manual");
}
