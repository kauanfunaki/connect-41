"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { aplicarRetencoes, cancelarContasDosImpostos, RecusaDaRetencao } from "@/lib/financeiro/retencoesServidor";
import { retencoesDaNota, resumoDasRetencoes } from "@/lib/financeiro/retencoes";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
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
import { contextoDeEntrada, registrarEnvios, avisarAprovadores } from "@/lib/financeiro/aprovacao/servidor";
import { centroNaCriacao } from "@/lib/financeiro/centroDeCustoServidor";
import { categoriaDaEmpresa } from "@/lib/financeiro/planoDeContas";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
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
  opcoes: { categoriaId?: string | null; vencimento?: string | null; centroDeCustoId?: string | null }
): Promise<ResultadoDoLancamento> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) return { error: "Sem permissão." };
  if (!canManageSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) return { error: "Só a coordenação do fiscal lança documento." };
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
        select: { id: true, defaultCategoryId: true, defaultCostCenterId: true },
      })
    : null;

  const categoriaId = categoriaDoLancamento(opcoes.categoriaId, existente?.defaultCategoryId);
  // O id vem do formulário (ou da contraparte): só vale categoria do plano desta empresa.
  if (
    categoriaId &&
    !(await prisma.financeCategory.findFirst({ where: categoriaDaEmpresa(ctx.tenantId, doc.companyId, categoriaId), select: { id: true } }))
  ) {
    return { error: "Categoria não encontrada no plano de contas desta empresa." };
  }

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

  // O centro escolhido na ficha vence; sem ele, o padrão da contraparte.
  const centro = await centroNaCriacao({
    tenantId: ctx.tenantId,
    companyId: doc.companyId,
    informadoId: opcoes.centroDeCustoId || null,
    padraoDaContraparteId: existente?.defaultCostCenterId ?? null,
  });
  if (!centro.ok) return { error: centro.erro };

  // Nasce PROVISORIO, portanto em aberto: conta a pagar de empresa com alçada
  // já entra aguardando aprovação.
  // As retenções por tributo que a NFS-e declara (lote D, 20/10): na conta a
  // pagar, cada uma vira a conta do imposto, junto com a da nota.
  const retencoes =
    veredito.kind === "PAGAR"
      ? retencoesDaNota(doc.retentionsByTax, {
          brutoCentavos: doc.amount === null ? null : centavosDeDecimal(doc.amount),
          liquidoCentavos: doc.netAmount === null ? null : centavosDeDecimal(doc.netAmount),
        })
      : [];

  const approvalStatus = (await contextoDeEntrada(ctx.tenantId, [doc.companyId])).statusInicial(
    doc.companyId,
    veredito.kind,
    "PROVISORIO"
  );

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
          approvalStatus,
          counterpartyId: contraparte.id,
          categoryId: categoriaId,
          costCenterId: centro.centroId,
          competence: doc.competence,
          dueDate: vencimento,
          // ── Bruto × líquido ────────────────────────────────────────────
          //
          // A conta paga o líquido quando a nota retém algo. `netAmount` só
          // existe quando há o que subtrair, então o `??` cobre os dois casos
          // que o BPO descreveu: com retenção, o líquido; sem retenção, o
          // bruto — que é o mesmo número que um líquido calculado daria.
          //
          // O documento continua exibindo `amount`: o acervo espelha o DANFSE,
          // e é a conta que muda, não a nota.
          amount: doc.netAmount ?? doc.amount!,
          description: `${doc.type} nº ${doc.number}${doc.series ? `/${doc.series}` : ""}`,
          // Emissão e número são os da nota (19/10) — e por isso travados na edição.
          issueDate: doc.issuedAt,
          documentNumber: `${doc.number}${doc.series ? `/${doc.series}` : ""}`.slice(0, 60),
          fiscalDocumentId: doc.id,
          createdById: ctx.userId,
        },
        select: { id: true, amount: true },
      });
      if (approvalStatus === "AGUARDANDO") await registrarEnvios(tx, [criado.id], ctx.userId || null);
      if (retencoes.length > 0) {
        await aplicarRetencoes(tx, {
          tenantId: ctx.tenantId!,
          userId: ctx.userId || null,
          conta: {
            id: criado.id,
            companyId: doc.companyId,
            counterpartyId: contraparte.id,
            competence: doc.competence,
            categoryId: categoriaId,
            costCenterId: centro.centroId,
            projectId: null,
            documentNumber: `${doc.number}${doc.series ? `/${doc.series}` : ""}`.slice(0, 60),
          },
          passos: retencoes.map((r) => ({ tipo: "criar" as const, tributo: r.tributo, centavos: r.centavos })),
        });
      }

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

    const aviso =
      approvalStatus === "AGUARDANDO" ? await avisarAprovadores(ctx.tenantId, [{ companyId: doc.companyId, amount: entry.amount }]) : null;

    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "financeiro.entry.created_from_document",
      entityType: "FinanceEntry",
      entityId: entry.id,
      metadata: {
        fiscalDocumentId: doc.id,
        kind: veredito.kind,
        categoriaId,
        centroDeCusto: centro.centroId,
        approvalStatus,
        ...(retencoes.length > 0 ? { retencoes: resumoDasRetencoes(retencoes) } : {}),
        ...(aviso ? { emailsDeAprovacao: aviso.enviados, semSmtp: aviso.semSmtp } : {}),
      },
    });

    revalidatePath("/documentos-fiscais");
    revalidatePath(`/documentos-fiscais/${doc.id}`);
    return { ok: true, entryId: entry.id };
  } catch (e) {
    if (e instanceof RecusaDaRetencao) return { error: e.message };
    // O unique de `fiscalDocumentId` é a garantia real contra duplicar valor:
    // dois cliques simultâneos passam pela checagem em aplicação e só um
    // sobrevive aqui.
    return { error: "Este documento já virou lançamento." };
  }
}

/**
 * Desfaz o lançamento e devolve o documento para pendente.
 *
 * Fica com a coordenação do fiscal, fora da regra "excluir só o administrador"
 * (13/10/2026), como o desfazer da conciliação e o da baixa: apaga o título que
 * o próprio lançamento criou, só enquanto ele não foi pago nem renegociado, o
 * documento continua no acervo e o AuditLog guarda o estorno. E é o único
 * conserto de um lançamento errado — o título não tem edição de categoria nem
 * de vencimento.
 */
export async function estornarLancamento(documentoId: string): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) return { error: "Sem permissão." };
  if (!canManageSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) return { error: "Só a coordenação do fiscal estorna." };

  const prisma = getPrisma();
  const doc = await obterDocumento(alcanceDaEquipe(ctx.tenantId), documentoId);
  if (!doc?.financeEntry) return { error: "Este documento não tem lançamento." };
  if (doc.financeEntry.status === "PAGO") {
    // Estornar algo já pago é problema de baixa bancária, não de acervo fiscal.
    // Apagar aqui esconderia um pagamento que saiu da conta.
    return { error: "O lançamento já foi pago. O estorno tem de ser feito no financeiro, com a baixa." };
  }
  if (doc.financeEntry.closeReason === "RENEGOCIADO" || doc.financeEntry.closeReason === "PERDA") {
    // Apagar o título apagaria junto a receita que a DRE econômica mantém e o
    // vínculo com o acordo (ou a decisão de perda). Desfaça na cobrança antes.
    return {
      error:
        doc.financeEntry.closeReason === "RENEGOCIADO"
          ? "O título foi renegociado num acordo de cobrança. Desfaça o acordo antes de estornar."
          : "O título foi baixado por perda na cobrança. Reverta a perda antes de estornar.",
    };
  }

  const entryId = doc.financeEntry.id;
  try {
    await prisma.$transaction(async (tx) => {
      // As contas dos impostos retidos (lote D, 20/10) ficam canceladas, como
      // histórico; a que já tem baixa barra o estorno.
      await cancelarContasDosImpostos(tx, ctx.tenantId, [entryId]);
      await tx.financeEntry.delete({ where: { id: entryId } });
      await tx.fiscalDocument.update({ where: { id: doc.id }, data: { destination: "PENDENTE" } });
    });
  } catch (e) {
    if (e instanceof RecusaDaRetencao) return { error: e.message };
    throw e;
  }

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
