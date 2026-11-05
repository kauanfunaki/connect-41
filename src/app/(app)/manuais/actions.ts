"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector, canActOnSector, podeExcluir, type AuthContext } from "@/lib/auth/context";
import { sanitizeDocumentHtml } from "@/lib/clientDocuments";
import { isModuleEnabled } from "@/lib/modules";

const MODULE = "bpo_manual";

export type ManualPageState = { error: string } | null;

// Manual/Instruções do setor — biblioteca em dois níveis (Documento > Página),
// escrita pelos próprios colaboradores (não upload de arquivo) pra
// alinhamento em caso de ausência/férias de alguém. Virou módulo próprio em
// 2026-07-24 (antes vivia dentro do detalhamento de uma tarefa via
// CanvasModal); a estrutura de dois níveis veio na sequência.
//
// Apoio de todo setor desde 05/11/2026: cada documento é de um setor
// (`ManualDocument.sectorCode`, que já existia e valia sempre "bpo"), e a
// permissão é a do setor do documento. Criar recebe o setor da tela
// (`setorDaTelaDoApoio`), conferido de novo aqui.

/** O documento, com o setor dele — ou nulo, se não é deste escritório. */
async function documento(ctx: AuthContext, documentId: string) {
  if (!ctx.tenantId) return null;
  return getPrisma().manualDocument.findFirst({ where: { id: documentId, tenantId: ctx.tenantId }, select: { id: true, sectorCode: true } });
}

/** A página, com o setor do documento dela. */
async function pagina(ctx: AuthContext, pageId: string) {
  if (!ctx.tenantId) return null;
  return getPrisma().manualPage.findFirst({ where: { id: pageId, tenantId: ctx.tenantId }, select: { id: true, document: { select: { sectorCode: true } } } });
}

export async function criarDocumentoManual(setor: string, titleRaw: string): Promise<{ error: string } | { id: string }> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  const title = titleRaw.trim();
  if (!tenantId || !userId) return { error: "Não autenticado" };
  if (!setor || !(await isModuleEnabled(tenantId, MODULE))) return { error: "O Repositório de manuais está desligado." };
  if (!canActOnSector(ctx, setor)) return { error: "Sem permissão para criar documento." };
  if (!title) return { error: "Título é obrigatório" };

  const prisma = getPrisma();
  try {
    const doc = await prisma.manualDocument.create({
      data: { tenantId, sectorCode: setor, title, createdById: userId },
    });
    revalidatePath("/manuais");
    return { id: doc.id };
  } catch (err) {
    console.error("[criarDocumentoManual]", err);
    return { error: "Erro ao criar documento." };
  }
}

export async function renomearDocumentoManual(documentId: string, titleRaw: string): Promise<void> {
  const ctx = await getAuthContext();
  const title = titleRaw.trim();
  const doc = await documento(ctx, documentId);
  if (!doc || !title || !canActOnSector(ctx, doc.sectorCode)) return;

  try {
    await getPrisma().manualDocument.update({ where: { id: doc.id }, data: { title } });
  } catch (err) {
    console.error("[renomearDocumentoManual]", err);
    return;
  }

  revalidatePath("/manuais");
}

// Emoji do documento (aparece na árvore da sidebar, estilo ícone de página do
// Notion). iconRaw vazio/null limpa o ícone.
export async function atualizarIconeDocumento(documentId: string, iconRaw: string | null): Promise<void> {
  const ctx = await getAuthContext();
  const doc = await documento(ctx, documentId);
  if (!doc || !canActOnSector(ctx, doc.sectorCode)) return;

  const icon = iconRaw?.trim() || null;
  try {
    await getPrisma().manualDocument.update({ where: { id: doc.id }, data: { icon } });
  } catch (err) {
    console.error("[atualizarIconeDocumento]", err);
    return;
  }

  revalidatePath("/manuais");
}

export async function excluirDocumentoManual(documentId: string): Promise<void> {
  const ctx = await getAuthContext();
  // Excluir documento do manual: só o administrador (13/10/2026). Era o gestor do BPO.
  if (!podeExcluir(ctx)) return;
  const doc = await documento(ctx, documentId);
  if (!doc || !canManageSector(ctx, doc.sectorCode)) return;

  try {
    await getPrisma().manualDocument.delete({ where: { id: doc.id } });
  } catch (err) {
    console.error("[excluirDocumentoManual]", err);
    return;
  }

  revalidatePath("/manuais");
}

export async function criarPaginaManual(documentId: string, titleRaw: string): Promise<{ error: string } | { id: string }> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  const title = titleRaw.trim();
  if (!tenantId || !userId) return { error: "Não autenticado" };
  const doc = await documento(ctx, documentId);
  if (!doc) return { error: "Documento não encontrado." };
  if (!canActOnSector(ctx, doc.sectorCode)) return { error: "Sem permissão para criar página." };
  if (!title) return { error: "Título é obrigatório" };

  const prisma = getPrisma();
  try {
    const lastPage = await prisma.manualPage.findFirst({ where: { documentId }, orderBy: { order: "desc" }, select: { order: true } });
    const page = await prisma.manualPage.create({
      data: { tenantId, documentId, title, createdById: userId, order: (lastPage?.order ?? -1) + 1 },
    });
    revalidatePath("/manuais");
    return { id: page.id };
  } catch (err) {
    console.error("[criarPaginaManual]", err);
    return { error: "Erro ao criar página." };
  }
}

export async function atualizarPaginaManual(pageId: string, _prev: ManualPageState, form: FormData): Promise<ManualPageState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  const pag = await pagina(ctx, pageId);
  if (!pag) return { error: "Página não encontrada." };
  if (!canActOnSector(ctx, pag.document.sectorCode)) return { error: "Sem permissão para editar esta página." };

  const title = (form.get("title") as string)?.trim();
  if (!title) return { error: "Título é obrigatório" };
  const rawContent = (form.get("content") as string)?.trim() ?? "";
  const sanitized = rawContent ? sanitizeDocumentHtml(rawContent) : "";
  const content = sanitized.replace(/<[^>]+>/g, "").trim() ? sanitized : "";

  try {
    await getPrisma().manualPage.update({ where: { id: pag.id }, data: { title, content: content || null } });
  } catch (err) {
    console.error("[atualizarPaginaManual]", err);
    return { error: "Erro ao salvar página." };
  }

  revalidatePath("/manuais");
  return null;
}

export async function excluirPaginaManual(pageId: string): Promise<void> {
  const ctx = await getAuthContext();
  // Excluir página do manual: só o administrador (13/10/2026). Era o gestor do BPO.
  if (!podeExcluir(ctx)) return;
  const pag = await pagina(ctx, pageId);
  if (!pag || !canManageSector(ctx, pag.document.sectorCode)) return;

  try {
    await getPrisma().manualPage.delete({ where: { id: pag.id } });
  } catch (err) {
    console.error("[excluirPaginaManual]", err);
    return;
  }

  revalidatePath("/manuais");
}
