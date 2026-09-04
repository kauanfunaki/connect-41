"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { obterDocumento } from "@/lib/fiscal/data";
import { alcanceDaEquipe } from "../alcance";
import { direcaoDoLancamento } from "@/lib/fiscal/documentos";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import {
  podeLancar,
  vencimentoPresumido,
  categoriaDoLancamento,
  categoriaObrigatoria,
} from "@/lib/financeiro/lancamento";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";

export type ResultadoDoLancamento = { error: string } | { ok: true; entryId: string };

/**
 * Transforma um documento fiscal em lançamento provisório.
 *
 * Tudo numa transação: criar a contraparte, criar o lançamento e mover o
 * destino do documento. Se qualquer parte falhar, nada fica pela metade — um
 * documento marcado como LANCADO sem lançamento correspondente seria um buraco
 * que ninguém acha depois.
 *
 * Exige `canManageSector`: decidir o que vira obrigação financeira do cliente
 * não é leitura de acervo.
 */
export async function lancarDocumento(
  documentoId: string,
  opcoes: { categoriaId?: string | null; vencimento?: string | null }
): Promise<ResultadoDoLancamento> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) return { error: "Sem permissão." };
  if (!canManageSector(ctx, SECTOR)) return { error: "Só a coordenação do fiscal lança documento." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { error: "Módulo não habilitado." };

  const prisma = getPrisma();
  const alcance = alcanceDaEquipe(ctx.tenantId);
  const doc = await obterDocumento(alcance, documentoId);
  if (!doc) return { error: "Documento não encontrado." };

  const empresaDoc = documentoDaEmpresa(doc.company);
  const direcao = direcaoDoLancamento(empresaDoc?.digitos ?? null, {
    emitenteDocumento: doc.issuerDocument,
    destinatarioDocumento: doc.recipientDocument,
  });

  // A contraparte é sempre o OUTRO lado: quem emitiu quando a empresa paga,
  // quem recebeu quando a empresa vende. Usar sempre o emitente cadastraria a
  // própria empresa como fornecedora dela mesma em metade dos casos.
  const contraparteDocumento = direcao === "PAGAR" ? doc.issuerDocument : doc.recipientDocument;
  const contraparteNome = direcao === "PAGAR" ? doc.issuerName : doc.recipientName;

  const existente = contraparteDocumento
    ? await prisma.financeCounterparty.findFirst({
        where: { tenantId: ctx.tenantId, companyId: doc.companyId, document: contraparteDocumento },
        select: { id: true, defaultCategoryId: true },
      })
    : null;

  const categoriaId = categoriaDoLancamento(opcoes.categoriaId, existente?.defaultCategoryId);

  const veredito = podeLancar({
    situacao: doc.situation,
    destino: doc.destination,
    removidoNaOrigem: doc.removedAtOrigin,
    jaTemLancamento: doc.financeEntry !== null,
    valor: doc.amount === null ? null : String(doc.amount),
    direcao,
  });
  if (!veredito.pode) return { error: veredito.explicacao };
  if (categoriaObrigatoria(veredito.kind) && !categoriaId) {
    return { error: "Escolha a categoria: despesa sem classificação não fecha o DRE." };
  }

  const vencimento = opcoes.vencimento ? new Date(opcoes.vencimento) : vencimentoPresumido(doc.issuedAt);
  if (Number.isNaN(vencimento.getTime())) return { error: "Vencimento inválido." };

  try {
    const entry = await prisma.$transaction(async (tx) => {
      // Contraparte sem documento não pode ser reaproveitada por CNPJ — o
      // unique é (tenant, empresa, documento) e NULL não casa com NULL. Cria uma
      // nova, que é o comportamento honesto: sem CNPJ não há como afirmar que é
      // a mesma pessoa da nota anterior.
      const contraparte =
        existente ??
        (await tx.financeCounterparty.create({
          data: {
            tenantId: ctx.tenantId!,
            companyId: doc.companyId,
            name: contraparteNome ?? "Contraparte não identificada",
            document: contraparteDocumento,
          },
          select: { id: true, defaultCategoryId: true },
        }));

      const criado = await tx.financeEntry.create({
        data: {
          tenantId: ctx.tenantId!,
          companyId: doc.companyId,
          kind: veredito.kind,
          // PROVISORIO é o ponto da etapa: nasce a conferir, não aprovado.
          status: "PROVISORIO",
          counterpartyId: contraparte.id,
          categoryId: categoriaId,
          competence: doc.competence,
          dueDate: vencimento,
          amount: doc.amount!,
          description: `${doc.type} nº ${doc.number}${doc.series ? `/${doc.series}` : ""}`,
          fiscalDocumentId: doc.id,
          createdById: ctx.userId,
        },
        select: { id: true },
      });

      // A primeira nota de um fornecedor classifica; da segunda em diante ela é
      // herdada. Gravar aqui é o que fecha esse ciclo.
      if (veredito.kind === "PAGAR" && categoriaId && !contraparte.defaultCategoryId) {
        await tx.financeCounterparty.update({
          where: { id: contraparte.id },
          data: { defaultCategoryId: categoriaId },
        });
      }

      await tx.fiscalDocument.update({
        where: { id: doc.id },
        data: { destination: "LANCADO", ignoredReason: null },
      });

      return criado;
    });

    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "financeiro.entry.created_from_document",
      entityType: "FinanceEntry",
      entityId: entry.id,
      metadata: { fiscalDocumentId: doc.id, kind: veredito.kind, categoriaId },
    });

    revalidatePath("/documentos-fiscais");
    revalidatePath(`/documentos-fiscais/${doc.id}`);
    return { ok: true, entryId: entry.id };
  } catch {
    // O unique de `fiscalDocumentId` é a garantia real contra duplicar valor:
    // dois cliques simultâneos passam pela checagem em aplicação e só um
    // sobrevive aqui.
    return { error: "Este documento já virou lançamento." };
  }
}

/** Desfaz o lançamento e devolve o documento para pendente. */
export async function estornarLancamento(documentoId: string): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) return { error: "Sem permissão." };
  if (!canManageSector(ctx, SECTOR)) return { error: "Só a coordenação do fiscal estorna." };

  const prisma = getPrisma();
  const doc = await obterDocumento(alcanceDaEquipe(ctx.tenantId), documentoId);
  if (!doc?.financeEntry) return { error: "Este documento não tem lançamento." };
  if (doc.financeEntry.status === "PAGO") {
    // Estornar algo já pago é problema de baixa bancária, não de acervo fiscal.
    // Apagar aqui esconderia um pagamento que saiu da conta.
    return { error: "O lançamento já foi pago. O estorno tem de ser feito no financeiro, com a baixa." };
  }

  const entryId = doc.financeEntry.id;
  await prisma.$transaction(async (tx) => {
    await tx.financeEntry.delete({ where: { id: entryId } });
    await tx.fiscalDocument.update({ where: { id: doc.id }, data: { destination: "PENDENTE" } });
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "financeiro.entry.reversed",
    entityType: "FinanceEntry",
    entityId: entryId,
    metadata: { fiscalDocumentId: doc.id },
  });

  revalidatePath("/documentos-fiscais");
  revalidatePath(`/documentos-fiscais/${doc.id}`);
  return { ok: true };
}
