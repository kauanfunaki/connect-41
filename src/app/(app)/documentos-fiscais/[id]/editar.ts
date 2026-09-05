"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { logAudit } from "@/lib/audit";
import { obterDocumento } from "@/lib/fiscal/data";
import { chaveDeDeduplicacao, competenciaDe } from "@/lib/fiscal/documentos";
import { alcanceDaEquipe } from "../alcance";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";
const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

export type EdicaoState = { error: string } | { ok: true } | null;

/**
 * Corrige à mão um documento já importado.
 *
 * ─── A ressalva, registrada aqui porque ela não some ─────────────────────────
 *
 * O XML é a verdade fiscal, e editar o acervo faz ele divergir do documento
 * impresso. Isso foi dito e a correção foi pedida assim mesmo (04/09), então o
 * desenho aqui é o que atende sem apagar o rastro: `editedAt` marca o documento
 * como corrigido à mão, e o AuditLog guarda **campo a campo o antes e o
 * depois**. Quem olhar a nota daqui a seis meses vê que ela foi mexida e
 * consegue reconstruir o que o XML dizia.
 *
 * ─── Por que a dedupKey é recalculada ────────────────────────────────────────
 *
 * Para NFS-e a identidade é `NFSE:{emitente}:{série}:{número}:{competência}` —
 * ou seja, editar número, série ou competência **muda a identidade do
 * documento**. Deixar a `dedupKey` velha faria a mesma nota entrar de novo numa
 * reimportação, agora como duplicata que o índice não barra. Recalcular e
 * deixar o unique do banco decidir é o que mantém a promessa da coluna.
 *
 * Para NF-e/NFC-e/CT-e a identidade é a chave de acesso de 44 dígitos, que não
 * é editável aqui — nota com chave errada é outro documento, não um campo
 * digitado errado.
 */
export async function editarDocumento(
  _anterior: EdicaoState,
  form: FormData
): Promise<EdicaoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) return { error: "Sem permissão." };
  if (!canManageSector(ctx, SECTOR)) {
    return { error: "Só a coordenação do fiscal corrige documento." };
  }
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { error: "Módulo não habilitado." };

  const documentoId = String(form.get("id") ?? "");
  const alcance = alcanceDaEquipe(ctx.tenantId);
  const doc = await obterDocumento(alcance, documentoId);
  if (!doc) return { error: "Documento não encontrado." };

  // Documento já lançado não se edita por aqui: o lançamento copiou valor e
  // vencimento, e mexer no documento deixaria os dois divergentes em silêncio.
  // Estorne primeiro — aí a correção e o relançamento ficam explícitos.
  if (doc.financeEntry) {
    return { error: "Estorne o lançamento antes de corrigir o documento." };
  }

  const prisma = getPrisma();

  const companyId = String(form.get("companyId") ?? "").trim() || doc.companyId;
  const number = String(form.get("number") ?? "").trim();
  const serieBruta = String(form.get("series") ?? "").trim();
  const issuerName = String(form.get("issuerName") ?? "").trim();
  const recipientNameBruto = String(form.get("recipientName") ?? "").trim();
  const amountBruto = String(form.get("amount") ?? "").trim();
  const issuedAtBruto = String(form.get("issuedAt") ?? "").trim();
  const competenceBruta = String(form.get("competence") ?? "").trim();

  if (!number) return { error: "Número do documento é obrigatório." };
  if (!issuerName) return { error: "Nome do emitente é obrigatório." };

  const issuedAt = issuedAtBruto ? new Date(issuedAtBruto) : doc.issuedAt;
  if (Number.isNaN(issuedAt.getTime())) return { error: "Data de emissão inválida." };

  // Competência em branco volta a seguir a emissão, que é a regra padrão. Vazia
  // não é "manter": é "derivar de novo".
  const competence = competenceBruta || competenciaDe(issuedAt);
  if (!COMPETENCIA.test(competence)) {
    return { error: "Competência deve estar no formato AAAA-MM." };
  }

  let amount: string | null = null;
  if (amountBruto) {
    // Aceita "1.234,56" e "1234.56" — quem digita vem do formato brasileiro.
    const normalizado = amountBruto.replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) {
      return { error: "Valor inválido. Use apenas números, com até duas casas." };
    }
    amount = normalizado;
  }

  // Empresa nova precisa estar no mesmo tenant — o id vem do formulário, e o
  // Prisma não expressa "empresa do mesmo tenant" como constraint.
  if (companyId !== doc.companyId) {
    const empresa = await prisma.company.findFirst({
      where: { id: companyId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!empresa) return { error: "Empresa não encontrada neste workspace." };
  }

  const novaDedupKey =
    chaveDeDeduplicacao({
      tipo: doc.type,
      chaveAcesso: doc.accessKey,
      emitenteDocumento: doc.issuerDocument,
      serie: serieBruta || null,
      numero: number,
      competencia: competence,
    }) ?? doc.dedupKey;

  const antes = {
    companyId: doc.companyId,
    number: doc.number,
    series: doc.series,
    issuerName: doc.issuerName,
    recipientName: doc.recipientName,
    amount: doc.amount?.toString() ?? null,
    issuedAt: doc.issuedAt.toISOString(),
    competence: doc.competence,
  };
  const depois = {
    companyId,
    number,
    series: serieBruta || null,
    issuerName,
    recipientName: recipientNameBruto || null,
    amount,
    issuedAt: issuedAt.toISOString(),
    competence,
  };

  try {
    await prisma.fiscalDocument.update({
      where: { id: documentoId },
      data: {
        companyId,
        number,
        series: serieBruta || null,
        issuerName,
        recipientName: recipientNameBruto || null,
        amount,
        issuedAt,
        competence,
        dedupKey: novaDedupKey,
        editedAt: new Date(),
      },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return {
        error:
          "Já existe outro documento com esta identidade (emitente, série, número e competência).",
      };
    }
    console.error("[editarDocumento]", err);
    return { error: "Erro ao salvar a correção." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "fiscal.document.edit",
    entityType: "FiscalDocument",
    entityId: documentoId,
    metadata: { antes, depois },
  });

  revalidatePath("/documentos-fiscais");
  revalidatePath(`/documentos-fiscais/${documentoId}`);
  return { ok: true };
}

/**
 * Remove um documento importado por engano.
 *
 * **Só quando não há lançamento.** Apagar um documento que já virou conta a
 * pagar deixaria o financeiro com uma linha sem origem — e a FK do lançamento
 * é `ON DELETE SET NULL`, ou seja, o banco deixaria isso acontecer em silêncio.
 * Estornar primeiro é explícito.
 *
 * A `dedupKey` sai junto com a linha, então reimportar o mesmo XML depois
 * funciona normalmente — que é justamente o que se quer de um "desfazer".
 */
export async function excluirDocumento(
  documentoId: string
): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) return { error: "Sem permissão." };
  if (!canManageSector(ctx, SECTOR)) {
    return { error: "Só a coordenação do fiscal exclui documento." };
  }
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { error: "Módulo não habilitado." };

  const alcance = alcanceDaEquipe(ctx.tenantId);
  const doc = await obterDocumento(alcance, documentoId);
  if (!doc) return { error: "Documento não encontrado." };
  if (doc.financeEntry) return { error: "Estorne o lançamento antes de excluir o documento." };

  const prisma = getPrisma();
  await prisma.fiscalDocument.delete({ where: { id: documentoId } });

  // Metadata farta de propósito: depois do delete, o AuditLog é a única coisa
  // que ainda sabe que este documento existiu.
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "fiscal.document.delete",
    entityType: "FiscalDocument",
    entityId: documentoId,
    metadata: {
      tipo: doc.type,
      numero: doc.number,
      serie: doc.series,
      emitente: doc.issuerName,
      emitenteDocumento: doc.issuerDocument,
      valor: doc.amount?.toString() ?? null,
      competencia: doc.competence,
      dedupKey: doc.dedupKey,
      companyId: doc.companyId,
    },
  });

  revalidatePath("/documentos-fiscais");
  return { ok: true };
}
