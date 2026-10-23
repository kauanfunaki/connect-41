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
import { planoDaNota } from "@/lib/financeiro/parcelasDaNota";
import { instanteDaData } from "@/lib/financeiro/periodo";
import { decimalDeCentavos } from "@/lib/financeiro/manual";
import { randomUUID } from "crypto";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";

/** Uma parcela mudou entre a leitura e o estorno — desfaz a transação inteira. */
class ParcelaMudou extends Error {}

/**
 * Por que esta conta da nota não pode ser apagada pelo estorno — `null` quando
 * pode. Duas frases: a da conta única (a de sempre) e a da parcela.
 */
function motivoQueBarraOEstorno(c: {
  status: string;
  paidPrincipal: { toString(): string };
  closeReason: string | null;
  agreementId: string | null;
}): { conta: string; parcela: string } | null {
  // Estornar algo já pago é problema de baixa bancária, não de acervo fiscal.
  // Apagar aqui esconderia um pagamento que saiu da conta.
  if (c.status === "PAGO") {
    return { conta: "O lançamento já foi pago. O estorno tem de ser feito no financeiro, com a baixa.", parcela: "já foi paga." };
  }
  if (Number(c.paidPrincipal.toString()) > 0) {
    return { conta: "O lançamento tem baixa parcial. Desfaça as baixas no financeiro antes de estornar.", parcela: "já tem baixa." };
  }
  // Apagar o título apagaria junto a receita que a DRE econômica mantém e o
  // vínculo com o acordo (ou a decisão de perda). Desfaça na cobrança antes.
  if (c.closeReason === "RENEGOCIADO" || c.agreementId !== null) {
    return {
      conta: "O título foi renegociado num acordo de cobrança. Desfaça o acordo antes de estornar.",
      parcela: "foi renegociada num acordo de cobrança.",
    };
  }
  if (c.closeReason === "PERDA") {
    return { conta: "O título foi baixado por perda na cobrança. Reverta a perda antes de estornar.", parcela: "foi baixada por perda na cobrança." };
  }
  return null;
}

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
    jaTemLancamento: doc.financeEntries.length > 0,
    valor: doc.amount === null ? null : String(doc.amount),
    direcao,
  });
  if (!veredito.pode) return { error: veredito.explicacao };
  if (categoriaObrigatoria(veredito.kind) && !categoriaId) {
    return { error: "Escolha a categoria: despesa sem classificação não fecha o DRE." };
  }

  // As retenções por tributo que a NFS-e declara (lote D, 20/10): na conta a
  // pagar, cada uma vira a conta do imposto, junto com a da nota. Na conta a
  // receber quem recolhe é o cliente — não nasce conta de imposto, mas a nota
  // que retém também não nasce parcelada (`planoDaNota`).
  const retencoesDeclaradas = retencoesDaNota(doc.retentionsByTax, {
    brutoCentavos: doc.amount === null ? null : centavosDeDecimal(doc.amount),
    liquidoCentavos: doc.netAmount === null ? null : centavosDeDecimal(doc.netAmount),
  });
  const retencoes = veredito.kind === "PAGAR" ? retencoesDeclaradas : [];

  // As duplicatas da nota (23/10, "parado #22"), de compra ou de venda: com
  // duas ou mais que fecham com a conta, ela nasce parcelada — uma parcela por
  // duplicata; com uma, vence no dia dela. Ver `parcelasDaNota.ts`. A mesma função monta
  // a prévia da ficha, então a tela mostra exatamente o que nasce aqui.
  const valorDaConta = doc.netAmount ?? doc.amount!;
  const plano = planoDaNota({
    duplicatas: doc.installments,
    totalCentavos: centavosDeDecimal(valorDaConta),
    kind: veredito.kind,
    comRetencoes: retencoesDeclaradas.length > 0,
  });
  const parcelas = plano.tipo === "PARCELAS" ? plano.parcelas : null;

  // Parcelada, o vencimento de cada parcela é o da duplicata, e o do
  // formulário não vale (a tela nem o mostra). Senão, o que a pessoa escolheu —
  // que a ficha preenche com o da duplicata única, quando há — ou o presumido.
  const vencimento = parcelas
    ? instanteDaData(parcelas[0]!.vencimentoKey)
    : opcoes.vencimento
      ? new Date(opcoes.vencimento)
      : plano.tipo === "VENCIMENTO"
        ? instanteDaData(plano.vencimentoKey)
        : vencimentoPresumido(doc.issuedAt);
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
  const approvalStatus = (await contextoDeEntrada(ctx.tenantId, [doc.companyId])).statusInicial(
    doc.companyId,
    veredito.kind,
    "PROVISORIO"
  );
  // A série das parcelas, como a do parcelamento manual: o mesmo id em todas, e
  // cada uma sabe a sua posição ("2/3").
  const serie = parcelas ? { recurrenceId: randomUUID(), recurrenceTotal: parcelas.length } : null;
  const numeroDoDocumento = `${doc.number}${doc.series ? `/${doc.series}` : ""}`.slice(0, 60);
  const descricao = `${doc.type} nº ${doc.number}${doc.series ? `/${doc.series}` : ""}`;
  const idsDasProximas = parcelas ? parcelas.slice(1).map(() => randomUUID()) : [];

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
          //
          // Parcelada pelas duplicatas, esta é a primeira parcela.
          amount: parcelas ? decimalDeCentavos(parcelas[0]!.centavos) : valorDaConta,
          description: descricao,
          // Emissão e número são os da nota (19/10) — e por isso travados na edição.
          issueDate: doc.issuedAt,
          documentNumber: numeroDoDocumento,
          // O vínculo com a nota (1:N desde 23/10: todas as parcelas o têm). A
          // posição 1 é a guarda do segundo clique: o unique de
          // (fiscalDocumentId, fiscalDocumentInstallment) barra o outro
          // "lançar" aqui, antes de qualquer outra parcela nascer — a
          // transação concorrente espera esta terminar e cai no duplicado.
          fiscalDocumentId: doc.id,
          fiscalDocumentInstallment: 1,
          createdById: ctx.userId,
          ...(serie ? { ...serie, recurrenceIndex: 1 } : {}),
        },
        select: { id: true, amount: true },
      });
      if (approvalStatus === "AGUARDANDO") await registrarEnvios(tx, [criado.id], ctx.userId || null);
      if (parcelas && serie) {
        // A regra da série, como a do parcelamento manual: todas nascem agora e
        // o agendador não olha para ela (VEZES). `MANTER`: o dia é o que a
        // duplicata diz, não se ajusta a dia útil.
        await tx.financeRecurrence.create({
          data: {
            id: serie.recurrenceId,
            tenantId: ctx.tenantId!,
            companyId: doc.companyId,
            frequency: "MENSAL",
            dayAdjust: "MANTER",
            endMode: "VEZES",
            endDate: null,
            total: serie.recurrenceTotal,
            firstDueDate: parcelas[0]!.vencimentoKey,
            firstCompetence: doc.competence,
            lastIndex: parcelas.length,
            createdById: ctx.userId || null,
          },
        });
        // As outras parcelas: a mesma conta, com o vencimento e o valor da
        // duplicata, e a competência da compra em todas (`parcelamento.ts`).
        // Emissão e número da nota vão junto, e o vínculo também (1:N, 23/10):
        // a parcela é do mesmo documento — trava na edição, não se cancela
        // sozinha e sai no estorno da nota, como a 1ª.
        await tx.financeEntry.createMany({
          data: parcelas.slice(1).map((p, i) => ({
            id: idsDasProximas[i]!,
            tenantId: ctx.tenantId!,
            companyId: doc.companyId,
            kind: veredito.kind,
            status: "PROVISORIO" as const,
            approvalStatus,
            counterpartyId: contraparte.id,
            categoryId: categoriaId,
            costCenterId: centro.centroId,
            competence: doc.competence,
            dueDate: instanteDaData(p.vencimentoKey),
            amount: decimalDeCentavos(p.centavos),
            description: descricao,
            issueDate: doc.issuedAt,
            documentNumber: numeroDoDocumento,
            fiscalDocumentId: doc.id,
            fiscalDocumentInstallment: p.indice,
            createdById: ctx.userId,
            ...serie,
            recurrenceIndex: p.indice,
          })),
        });
        if (approvalStatus === "AGUARDANDO") await registrarEnvios(tx, idsDasProximas, ctx.userId || null);
      }
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
            documentNumber: numeroDoDocumento,
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

    // Cada conta que espera aprovação com o valor dela — as parcelas não têm o mesmo.
    const aviso =
      approvalStatus === "AGUARDANDO"
        ? await avisarAprovadores(ctx.tenantId, [
            { companyId: doc.companyId, amount: entry.amount },
            ...(parcelas ?? []).slice(1).map((p) => ({ companyId: doc.companyId, amount: decimalDeCentavos(p.centavos) })),
          ])
        : null;

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
        // O que as duplicatas da nota decidiram — e, quando não deu para usá-las,
        // por quê: é o que explica, depois, uma conta inteira de nota parcelada.
        ...(parcelas && serie
          ? {
              duplicatas: {
                parcelas: parcelas.length,
                serie: serie.recurrenceId,
                vencimentos: parcelas.map((p) => p.vencimentoKey),
                total: decimalDeCentavos(centavosDeDecimal(valorDaConta)),
              },
            }
          : plano.tipo === "VENCIMENTO"
            ? { duplicatas: { parcelas: 1, vencimentoDaNota: plano.vencimentoKey } }
            : plano.tipo === "RECUSADO"
              ? { duplicatas: { recusadas: plano.motivo } }
              : {}),
        ...(aviso ? { emailsDeAprovacao: aviso.enviados, semSmtp: aviso.semSmtp } : {}),
      },
    });

    revalidatePath("/documentos-fiscais");
    revalidatePath(`/documentos-fiscais/${doc.id}`);
    return { ok: true, entryId: entry.id };
  } catch (e) {
    if (e instanceof RecusaDaRetencao) return { error: e.message };
    // O unique de (`fiscalDocumentId`, `fiscalDocumentInstallment`) é a
    // garantia real contra duplicar valor: dois cliques simultâneos passam pela
    // checagem em aplicação e só um sobrevive aqui — o outro bate na posição 1.
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
  if (!doc) return { error: "Este documento não tem lançamento." };

  // Todas as contas da nota (1:N desde 23/10): a conta única, ou as parcelas
  // que nasceram das duplicatas. Lidas de novo, com o que o estorno precisa
  // conferir — a ficha não traz baixa nem acordo. A conta que nasceu parcelada
  // estorna inteira: as parcelas são a mesma nota, e deixar a 2ª e a 3ª sem a
  // 1ª seria lançar parte de uma compra (ou venda) que voltou para pendente.
  const contas = await prisma.financeEntry.findMany({
    where: { tenantId: ctx.tenantId, fiscalDocumentId: doc.id },
    select: {
      id: true,
      status: true,
      paidPrincipal: true,
      closeReason: true,
      agreementId: true,
      recurrenceId: true,
      fiscalDocumentInstallment: true,
    },
    orderBy: { fiscalDocumentInstallment: "asc" },
  });
  if (contas.length === 0) return { error: "Este documento não tem lançamento." };

  // A mesma regra para cada uma — com baixa (inteira ou parcial), renegociada
  // ou perdida, o estorno para, e nada é apagado.
  const parcelada = contas.length > 1;
  for (const c of contas) {
    const motivo = motivoQueBarraOEstorno(c);
    if (!motivo) continue;
    return {
      error: parcelada
        ? `A parcela ${c.fiscalDocumentInstallment} desta nota ${motivo.parcela} Desfaça no financeiro antes de estornar.`
        : motivo.conta,
    };
  }

  const ids = contas.map((c) => c.id);
  const series = [...new Set(contas.flatMap((c) => (c.recurrenceId ? [c.recurrenceId] : [])))];

  try {
    await prisma.$transaction(async (tx) => {
      // As contas dos impostos retidos (lote D, 20/10) ficam canceladas, como
      // histórico; a que já tem baixa barra o estorno.
      await cancelarContasDosImpostos(tx, ctx.tenantId, ids);
      // Condicionado ao estado lido: a baixa ou o acordo que chegou entre a
      // leitura e aqui não é apagado por baixo — a contagem não fecha e a
      // transação inteira desfaz.
      const apagadas = await tx.financeEntry.deleteMany({
        where: {
          id: { in: ids },
          tenantId: ctx.tenantId,
          fiscalDocumentId: doc.id,
          status: { not: "PAGO" },
          paidPrincipal: 0,
          agreementId: null,
          payments: { none: {} },
        },
      });
      if (apagadas.count !== ids.length) {
        throw new ParcelaMudou(
          parcelada ? "Uma parcela desta nota acabou de mudar — atualize a tela." : "O lançamento acabou de mudar — atualize a tela."
        );
      }
      if (series.length > 0) await tx.financeRecurrence.deleteMany({ where: { id: { in: series }, tenantId: ctx.tenantId } });
      await tx.fiscalDocument.update({ where: { id: doc.id }, data: { destination: "PENDENTE" } });
    });
  } catch (e) {
    if (e instanceof RecusaDaRetencao || e instanceof ParcelaMudou) return { error: e.message };
    throw e;
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "financeiro.entry.reversed",
    entityType: "FinanceEntry",
    entityId: ids[0]!,
    metadata: { fiscalDocumentId: doc.id, ...(parcelada ? { parcelas: ids.length, serie: series[0] ?? null } : {}) },
  });

  revalidatePath("/documentos-fiscais");
  revalidatePath(`/documentos-fiscais/${doc.id}`);
  return { ok: true };
}
