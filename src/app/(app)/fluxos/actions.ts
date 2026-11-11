"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { sanitizeDocumentHtml } from "@/lib/clientDocuments";
import { isModuleEnabled } from "@/lib/modules";
import { getSectorMaps } from "@/lib/sectors";
import { fluxoEmBranco, lerFluxo, type CampoDaEtapa } from "@/lib/fluxos/etapas";
import { ehTelaDoConnect } from "@/lib/fluxos/telas";
import { MODULO_FLUXOS, dataParaOBanco, podeEditarOsFluxos, podeExcluirDosFluxos } from "@/lib/fluxos/regras";
import { apagarArquivosDosAnexos, fluxoDoEscritorio, pastaDoEscritorio, pessoasDoSetor } from "@/lib/fluxos/servidor";

// O Repositório de fluxos (10/11/2026, pedido do Kauan): pastas → fluxos por
// setor, como o Repositório de manuais. Cada action confere de novo o setor da
// pasta ou do fluxo (nunca o da tela) e a regra de `regras.ts`.

const CAMINHO = "/fluxos";
const LIMITE_DO_TITULO = 160;

export type Resultado = { error: string } | { id: string };

function titulo(bruto: string): string | null {
  const t = (bruto ?? "").trim();
  return t && t.length <= LIMITE_DO_TITULO ? t : null;
}

async function ligado(tenantId: string) {
  return isModuleEnabled(tenantId, MODULO_FLUXOS);
}

// ─── Pastas ─────────────────────────────────────────────────────────────────

export async function criarPastaDeFluxos(setor: string, tituloBruto: string): Promise<Resultado> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return { error: "Não autenticado" };
  if (!setor || !(await ligado(tenantId))) return { error: "O Repositório de fluxos está desligado." };
  if (!podeEditarOsFluxos(ctx, setor)) return { error: "Sem permissão para criar pasta neste setor." };
  const nome = titulo(tituloBruto);
  if (!nome) return { error: `Dê um nome à pasta (até ${LIMITE_DO_TITULO} letras).` };

  try {
    const prisma = getPrisma();
    const ultima = await prisma.flowFolder.findFirst({ where: { tenantId, sectorCode: setor }, orderBy: { order: "desc" }, select: { order: true } });
    const pasta = await prisma.flowFolder.create({ data: { tenantId, sectorCode: setor, title: nome, createdById: userId, order: (ultima?.order ?? -1) + 1 } });
    await logAudit({ tenantId, userId, action: "fluxo.pasta.create", entityType: "FlowFolder", entityId: pasta.id, metadata: { title: nome, setor } });
    revalidatePath(CAMINHO);
    return { id: pasta.id };
  } catch (err) {
    console.error("[criarPastaDeFluxos]", err);
    return { error: "Erro ao criar a pasta." };
  }
}

export async function renomearPastaDeFluxos(pastaId: string, tituloBruto: string): Promise<void> {
  const ctx = await getAuthContext();
  const pasta = await pastaDoEscritorio(ctx, pastaId);
  const nome = titulo(tituloBruto);
  if (!pasta || !nome || nome === pasta.title || !podeEditarOsFluxos(ctx, pasta.sectorCode)) return;
  try {
    await getPrisma().flowFolder.update({ where: { id: pasta.id }, data: { title: nome } });
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fluxo.pasta.update", entityType: "FlowFolder", entityId: pasta.id, metadata: { title: nome, antes: pasta.title } });
  } catch (err) {
    console.error("[renomearPastaDeFluxos]", err);
    return;
  }
  revalidatePath(CAMINHO);
}

/** O emoji da pasta na árvore, como nos manuais. Vazio limpa. */
export async function mudarIconeDaPastaDeFluxos(pastaId: string, iconeBruto: string | null): Promise<void> {
  const ctx = await getAuthContext();
  const pasta = await pastaDoEscritorio(ctx, pastaId);
  if (!pasta || !podeEditarOsFluxos(ctx, pasta.sectorCode)) return;
  const icone = iconeBruto?.trim().slice(0, 8) || null;
  try {
    await getPrisma().flowFolder.update({ where: { id: pasta.id }, data: { icon: icone } });
  } catch (err) {
    console.error("[mudarIconeDaPastaDeFluxos]", err);
    return;
  }
  revalidatePath(CAMINHO);
}

export async function excluirPastaDeFluxos(pastaId: string): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  const pasta = await pastaDoEscritorio(ctx, pastaId);
  if (!pasta) return { error: "Pasta não encontrada." };
  if (!podeExcluirDosFluxos(ctx, pasta.sectorCode)) return { error: "Só o Administrador ou o Super Admin pode excluir." };
  try {
    const prisma = getPrisma();
    // Os arquivos saem do disco depois das linhas (que vão em cascata com a pasta).
    const anexos = await prisma.flowAttachment.findMany({ where: { flowDoc: { folderId: pasta.id, tenantId: ctx.tenantId } }, select: { storagePath: true } });
    const fluxos = await prisma.flowDoc.count({ where: { folderId: pasta.id } });
    await prisma.flowFolder.delete({ where: { id: pasta.id } });
    await apagarArquivosDosAnexos(ctx.tenantId, anexos.map((a) => a.storagePath));
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fluxo.pasta.delete", entityType: "FlowFolder", entityId: pasta.id, metadata: { title: pasta.title, fluxos } });
  } catch (err) {
    console.error("[excluirPastaDeFluxos]", err);
    return { error: "Erro ao excluir a pasta." };
  }
  revalidatePath(CAMINHO);
  return null;
}

// ─── Fluxos ─────────────────────────────────────────────────────────────────

/** O fluxo nasce com Início e Fim e versão 0: a primeira "Salvar versão" é a 1. */
export async function criarFluxo(pastaId: string, tituloBruto: string): Promise<Resultado> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return { error: "Não autenticado" };
  if (!(await ligado(tenantId))) return { error: "O Repositório de fluxos está desligado." };
  const pasta = await pastaDoEscritorio(ctx, pastaId);
  if (!pasta) return { error: "Pasta não encontrada." };
  if (!podeEditarOsFluxos(ctx, pasta.sectorCode)) return { error: "Sem permissão para criar fluxo neste setor." };
  const nome = titulo(tituloBruto);
  if (!nome) return { error: `Dê um nome ao fluxo (até ${LIMITE_DO_TITULO} letras).` };

  try {
    const prisma = getPrisma();
    const ultimo = await prisma.flowDoc.findFirst({ where: { folderId: pasta.id }, orderBy: { order: "desc" }, select: { order: true } });
    const fluxo = await prisma.flowDoc.create({
      data: { tenantId, folderId: pasta.id, title: nome, steps: fluxoEmBranco(), ownerUserId: userId, createdById: userId, order: (ultimo?.order ?? -1) + 1 },
    });
    await logAudit({ tenantId, userId, action: "fluxo.create", entityType: "FlowDoc", entityId: fluxo.id, metadata: { title: nome, pasta: pasta.title } });
    revalidatePath(CAMINHO);
    return { id: fluxo.id };
  } catch (err) {
    console.error("[criarFluxo]", err);
    return { error: "Erro ao criar o fluxo." };
  }
}

export type EntradaDaVersao = {
  fluxoId: string;
  /** A versão que estava na tela quando a edição começou. */
  versaoBase: number;
  titulo: string;
  donoId: string | null;
  /** "AAAA-MM-DD" ou vazio. */
  revisadoEm: string | null;
  metodologia: string;
  etapas: unknown;
};

export type ResultadoDaVersao = { ok: true; versao: number } | { ok: false; mensagem: string; etapaId?: string; campo?: CampoDaEtapa | "titulo-do-fluxo" | "dono" | "revisado" };

/**
 * "Salvar versão N": grava o fluxo e a foto dele em `FlowVersion`, numa
 * transação. Se outra pessoa salvou uma versão enquanto esta editava, a
 * gravação é recusada em vez de passar por cima do trabalho dela.
 */
export async function salvarVersaoDoFluxo(entrada: EntradaDaVersao): Promise<ResultadoDaVersao> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return { ok: false, mensagem: "Não autenticado" };
  if (!(await ligado(tenantId))) return { ok: false, mensagem: "O Repositório de fluxos está desligado." };
  const fluxo = await fluxoDoEscritorio(ctx, entrada.fluxoId);
  if (!fluxo) return { ok: false, mensagem: "Fluxo não encontrado." };
  const setor = fluxo.folder.sectorCode;
  if (!podeEditarOsFluxos(ctx, setor)) return { ok: false, mensagem: "Sem permissão para editar este fluxo." };

  const nome = titulo(entrada.titulo);
  if (!nome) return { ok: false, mensagem: `Dê um nome ao fluxo (até ${LIMITE_DO_TITULO} letras).`, campo: "titulo-do-fluxo" };
  const revisadoEm = dataParaOBanco(entrada.revisadoEm);
  if (entrada.revisadoEm && !revisadoEm) return { ok: false, mensagem: "A data de “Revisado em” não é válida.", campo: "revisado" };

  const prisma = getPrisma();
  const atual = await prisma.flowDoc.findUnique({ where: { id: fluxo.id }, select: { ownerUserId: true } });
  if (entrada.donoId) {
    const pessoas = await pessoasDoSetor(tenantId, setor, atual?.ownerUserId ?? null);
    if (!pessoas.some((p) => p.id === entrada.donoId)) return { ok: false, mensagem: "Escolha como dono uma pessoa do setor.", campo: "dono" };
  }

  const { labels } = await getSectorMaps(tenantId);
  const lido = lerFluxo(entrada.etapas, { telaValida: ehTelaDoConnect, setores: new Set(Object.keys(labels)) });
  if (!lido.ok) return { ok: false, mensagem: lido.mensagem, etapaId: lido.etapaId, campo: lido.campo };

  // A mesma limpeza da página do manual: HTML sanitizado, e só espaço vira nulo.
  const bruto = (entrada.metodologia ?? "").trim();
  const sanitizado = bruto ? sanitizeDocumentHtml(bruto) : "";
  const metodologia = sanitizado.replace(/<[^>]+>/g, "").trim() ? sanitizado : null;

  const quem = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const nova = entrada.versaoBase + 1;
  try {
    const salvou = await prisma.$transaction(async (tx) => {
      const r = await tx.flowDoc.updateMany({
        where: { id: fluxo.id, version: entrada.versaoBase },
        data: { title: nome, ownerUserId: entrada.donoId || null, reviewedAt: revisadoEm, methodology: metodologia, steps: lido.etapas, version: nova, updatedById: userId },
      });
      if (r.count === 0) return false;
      await tx.flowVersion.create({
        data: { flowDocId: fluxo.id, version: nova, title: nome, steps: lido.etapas, methodology: metodologia, reviewedAt: revisadoEm, savedById: userId, savedByName: (quem?.name ?? "").slice(0, 160) || "—" },
      });
      return true;
    });
    if (!salvou) {
      return { ok: false, mensagem: `Outra pessoa salvou a versão ${fluxo.version} enquanto você editava. Copie o que mudou, recarregue a página e edite de novo.` };
    }
    await logAudit({
      tenantId,
      userId,
      action: "fluxo.versao",
      entityType: "FlowDoc",
      entityId: fluxo.id,
      metadata: { title: nome, versao: nova, etapas: lido.etapas.length, avisos: lido.avisos.length },
    });
  } catch (err) {
    console.error("[salvarVersaoDoFluxo]", err);
    return { ok: false, mensagem: "Erro ao salvar a versão." };
  }
  revalidatePath(CAMINHO);
  return { ok: true, versao: nova };
}

export async function excluirFluxo(fluxoId: string): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  const fluxo = await fluxoDoEscritorio(ctx, fluxoId);
  if (!fluxo) return { error: "Fluxo não encontrado." };
  if (!podeExcluirDosFluxos(ctx, fluxo.folder.sectorCode)) return { error: "Só o Administrador ou o Super Admin pode excluir." };
  try {
    const prisma = getPrisma();
    const anexos = await prisma.flowAttachment.findMany({ where: { flowDocId: fluxo.id }, select: { storagePath: true } });
    await prisma.flowDoc.delete({ where: { id: fluxo.id } });
    await apagarArquivosDosAnexos(ctx.tenantId, anexos.map((a) => a.storagePath));
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fluxo.delete", entityType: "FlowDoc", entityId: fluxo.id, metadata: { title: fluxo.title, versao: fluxo.version } });
  } catch (err) {
    console.error("[excluirFluxo]", err);
    return { error: "Erro ao excluir o fluxo." };
  }
  revalidatePath(CAMINHO);
  return null;
}

export async function excluirAnexoDoFluxo(anexoId: string): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  const prisma = getPrisma();
  const anexo = await prisma.flowAttachment.findFirst({
    where: { id: anexoId, flowDoc: { tenantId: ctx.tenantId } },
    select: { id: true, fileName: true, storagePath: true, flowDocId: true, flowDoc: { select: { folder: { select: { sectorCode: true } } } } },
  });
  if (!anexo) return { error: "Arquivo não encontrado." };
  if (!podeExcluirDosFluxos(ctx, anexo.flowDoc.folder.sectorCode)) return { error: "Só o Administrador ou o Super Admin pode excluir." };
  try {
    await prisma.flowAttachment.delete({ where: { id: anexo.id } });
    await apagarArquivosDosAnexos(ctx.tenantId, [anexo.storagePath]);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fluxo.anexo.delete", entityType: "FlowAttachment", entityId: anexo.id, metadata: { nome: anexo.fileName, fluxo: anexo.flowDocId } });
  } catch (err) {
    console.error("[excluirAnexoDoFluxo]", err);
    return { error: "Erro ao excluir o arquivo." };
  }
  revalidatePath(CAMINHO);
  return null;
}
