"use server";

// Anexar e tirar arquivo de uma conta que já existe — a seção "Anexos" da
// janela Editar (19/10, lote H2). O anexo do lançamento novo entra junto com
// ele, em `criarLancamentoManual`.
//
// Anexo não tem trava: guardar o boleto ou o comprovante não mexe no dinheiro,
// então vale também para conta paga, conciliada ou vinda de nota — o mesmo
// raciocínio da classificação na edição.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { podeEditarOTipo } from "./acessoDaConta";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { anexosDaConta, armazenamentoDosAnexos, MAXIMO_DE_ANEXOS_POR_CONTA, type AnexoDaConta } from "./anexos";
import { arquivosDoFormulario } from "./pendencias/armazenamento";

export type ResultadoDoAnexo = { error: string } | { ok: true; anexos: AnexoDaConta[] };

function revalidar() {
  for (const p of ["/pagar", "/receber", "/lancamentos"]) revalidatePath(p);
}

/** Grava os arquivos de `anexos` na conta `entryId` e devolve a lista nova. */
export async function anexarAoLancamento(formData: FormData): Promise<ResultadoDoAnexo> {
  const entryId = String(formData.get("entryId") ?? "");
  const quem = await getAuthContext();
  if (!quem.tenantId) return { error: "Não autenticado." };
  const prisma = getPrisma();
  // Conta de outro escritório responde como inexistente.
  const conta = await prisma.financeEntry.findFirst({
    where: { id: entryId, tenantId: quem.tenantId },
    select: { id: true, kind: true, companyId: true, _count: { select: { attachments: true } } },
  });
  if (!conta) return { error: "Lançamento não encontrado." };
  const acesso = await podeEditarOTipo(conta.kind);
  if (!acesso.ctx) return { error: acesso.erro };
  const { ctx } = acesso;
  // Uma empresa por vez no BPO (21/10/2026): com foco, só grava nele.
  const foraDoFoco = await recusaDoFoco(ctx, [conta.companyId]);
  if (foraDoFoco) return { error: foraDoFoco };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  if (arquivos.length === 0) return { error: "Escolha um arquivo." };
  if (conta._count.attachments + arquivos.length > MAXIMO_DE_ANEXOS_POR_CONTA) {
    return { error: `Uma conta guarda até ${MAXIMO_DE_ANEXOS_POR_CONTA} anexos.` };
  }

  const gravacao = await armazenamentoDosAnexos.gravarAnexos(ctx.tenantId, arquivos);
  if (!gravacao.ok) return { error: gravacao.erro };
  try {
    await prisma.financeEntryAttachment.createMany({
      data: gravacao.anexos.map((a) => ({ ...a, tenantId: ctx.tenantId, entryId: conta.id, uploadedByUserId: ctx.userId || null })),
    });
  } catch (err) {
    await armazenamentoDosAnexos.apagarAnexosGravados(gravacao.anexos);
    throw err;
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "finance.attachment_added",
    entityType: "FinanceEntry",
    entityId: conta.id,
    metadata: { arquivos: gravacao.anexos.map((a) => a.fileName) },
  });
  revalidar();
  return { ok: true, anexos: await anexosDaConta(ctx.tenantId, conta.id) };
}

/**
 * Tira um anexo da conta. A linha sai primeiro e o arquivo depois — se o disco
 * falhar, sobra um arquivo que ninguém vê, em vez de uma linha apontando para o
 * nada (a mesma ordem da exclusão de cadastro).
 */
export async function removerAnexoDoLancamento(anexoId: string): Promise<ResultadoDoAnexo> {
  const quem = await getAuthContext();
  if (!quem.tenantId) return { error: "Não autenticado." };
  const prisma = getPrisma();
  const anexo = await prisma.financeEntryAttachment.findFirst({
    where: { id: anexoId, tenantId: quem.tenantId },
    select: { id: true, entryId: true, fileName: true, fileUrl: true, entry: { select: { kind: true, companyId: true } } },
  });
  if (!anexo) return { error: "Anexo não encontrado." };
  const acesso = await podeEditarOTipo(anexo.entry.kind);
  if (!acesso.ctx) return { error: acesso.erro };
  const { ctx } = acesso;
  // Uma empresa por vez no BPO (21/10/2026): com foco, só grava nele.
  const foraDoFoco = await recusaDoFoco(ctx, [anexo.entry.companyId]);
  if (foraDoFoco) return { error: foraDoFoco };

  const apagado = await prisma.financeEntryAttachment.deleteMany({ where: { id: anexo.id, tenantId: ctx.tenantId } });
  if (apagado.count === 1) await armazenamentoDosAnexos.apagarArquivos([anexo.fileUrl]);

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "finance.attachment_removed",
    entityType: "FinanceEntry",
    entityId: anexo.entryId,
    metadata: { arquivo: anexo.fileName },
  });
  revalidar();
  return { ok: true, anexos: await anexosDaConta(ctx.tenantId, anexo.entryId) };
}
