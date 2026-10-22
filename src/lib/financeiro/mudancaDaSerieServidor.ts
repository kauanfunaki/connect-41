"use server";

// Mudar a série daqui em diante (22/10/2026) — a leitura da janela e a
// gravação. A regra de quais contas mudam é pura e mora em `mudancaDaSerie.ts`.
//
// As contas que o agendador ainda vai criar (a série até uma data ou sem fim,
// `estenderSeries`) copiam a última conta não cancelada da série: mudar as em
// aberto daqui em diante já leva o valor, a categoria e a descrição novos para
// elas. O dia novo, que vem da regra e não da conta copiada, vai para a regra
// (`FinanceRecurrence.dueDay`).

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { feriadosDoEscritorio } from "@/lib/feriados";
import { presaAoOmie } from "@/lib/integracoes/omie/virada";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { travasDaEdicao, aprovacaoDepoisDaEdicao } from "./edicao";
import { podeEditarOTipo } from "./acessoDaConta";
import { categoriaDaEmpresa, ondeDaEmpresa } from "./planoDeContas";
import { centavosDeDecimal } from "./contas";
import { decimalDeCentavos } from "./manual";
import { instanteDaData } from "./periodo";
import { contextoDeEntrada, registrarEnvios, avisarAprovadores } from "./aprovacao/servidor";
import { frequenciaComDiaDoMes, rotuloDaSerie, vencimentoNaPosicao, type AjusteDoDia, type Frequencia } from "./repeticao";
import { camposDaMudanca, contasDaquiEmDiante, lerMudancaDaSerie, type ContaDaSerie } from "./mudancaDaSerie";

const VEM_DO_OMIE = "Vem do Omie, e a empresa ainda é lida de lá — mude no Omie; a próxima leitura traz para cá.";
const SERIE_ANTIGA = "Esta série é de antes de 21/10 e não guardou a regra — mude o vencimento conta a conta, em Editar.";
const SEM_DIA_DO_MES = "O dia do vencimento só muda na série mensal ou anual — nas outras, mude conta a conta, em Editar.";

/** A conta de onde a pessoa pediu a mudança. */
async function lerConta(tenantId: string, entryId: string) {
  return getPrisma().financeEntry.findFirst({
    where: { id: entryId, tenantId },
    select: {
      id: true,
      companyId: true,
      kind: true,
      amount: true,
      categoryId: true,
      description: true,
      dueDate: true,
      recurrenceId: true,
      recurrenceIndex: true,
      recurrenceTotal: true,
      omieTitleId: true,
      omieMovementId: true,
      counterparty: { select: { name: true } },
      company: { select: { omieCutoverAt: true } },
    },
  });
}

/** Esta conta e as próximas da série, com o que as travas da edição precisam. */
async function contasDaSerie(tenantId: string, companyId: string, recurrenceId: string, aPartirDe: number) {
  const prisma = getPrisma();
  const contas = await prisma.financeEntry.findMany({
    where: { tenantId, companyId, recurrenceId, recurrenceIndex: { gte: aPartirDe } },
    select: {
      id: true,
      recurrenceIndex: true,
      status: true,
      paidAt: true,
      closeReason: true,
      fiscalDocumentId: true,
      agreementId: true,
      omieTitleId: true,
      omieMovementId: true,
      omieDepartmentId: true,
      omieReconciledAt: true,
      paidPrincipal: true,
      cardAccountId: true,
      approvalStatus: true,
      amount: true,
      categoryId: true,
      description: true,
      dueDate: true,
      updatedAt: true,
      bankMatches: { select: { id: true }, take: 1 },
      retentionOrigin: { select: { tax: true } },
      company: { select: { omieCutoverAt: true } },
    },
    orderBy: { recurrenceIndex: "asc" },
  });
  const rateadas = new Set(
    contas.length === 0
      ? []
      : (
          await prisma.financeEntryAllocation.findMany({
            where: { tenantId, entryId: { in: contas.map((c) => c.id) } },
            select: { entryId: true },
            distinct: ["entryId"],
          })
        ).map((r) => r.entryId)
  );
  return contas.map((c) => {
    const conta: ContaDaSerie = {
      id: c.id,
      indice: c.recurrenceIndex ?? 0,
      status: c.status,
      paidAt: c.paidAt,
      pagoCentavos: centavosDeDecimal(c.paidPrincipal),
      edicao: travasDaEdicao({
        status: c.status,
        paidAt: c.paidAt,
        closeReason: c.closeReason,
        fiscalDocumentId: c.fiscalDocumentId,
        agreementId: c.agreementId,
        // Até a virada da empresa (lote E): depois, o Connect é a fonte.
        doOmie: presaAoOmie(c, c.company),
        centroDoOmie: c.omieDepartmentId !== null,
        conciliada: c.bankMatches.length > 0 || c.omieReconciledAt !== null,
        temBaixa: centavosDeDecimal(c.paidPrincipal) > 0,
        deRetencao: c.retentionOrigin !== null,
        daFatura: c.cardAccountId !== null,
      }),
      rateada: rateadas.has(c.id),
    };
    return { conta, linha: c };
  });
}

type Opcao = { id: string; nome: string };

export type DadosDaMudancaDaSerie =
  | {
      ok: true;
      conta: {
        id: string;
        kind: "PAGAR" | "RECEBER";
        contraparte: string;
        /** "3/12" — de onde a mudança parte. */
        posicao: string;
        /** "1.234,56" — o valor desta conta, para a janela mostrar. */
        valor: string;
        categoriaId: string | null;
        descricao: string | null;
        /** O dia do mês do vencimento desta conta. */
        dia: number;
      };
      categorias: Opcao[];
      /** Quantas contas em aberto há desta em diante (esta inclusa). */
      emAberto: number;
      /** O dia do vencimento pode mudar — ou o porquê de não poder. */
      dia: { pode: true } | { pode: false; motivo: string };
      /** A série cria contas sozinha com o tempo (até uma data ou sem fim) e ainda não acabou. */
      nascemSozinhas: boolean;
    }
  | { ok: false; erro: string };

/** O que a janela "Mudar a série daqui em diante" precisa para abrir. */
export async function dadosDaMudancaDaSerie(entryId: string): Promise<DadosDaMudancaDaSerie> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Não autenticado." };
  const conta = await lerConta(ctx.tenantId, entryId);
  if (!conta) return { ok: false, erro: "Lançamento não encontrado." };
  const acesso = await podeEditarOTipo(conta.kind);
  if (!acesso.ctx) return { ok: false, erro: acesso.erro ?? "Sem permissão." };
  if (!conta.recurrenceId || !conta.recurrenceIndex) return { ok: false, erro: "Este lançamento não faz parte de uma série." };
  if (presaAoOmie(conta, conta.company)) return { ok: false, erro: VEM_DO_OMIE };

  const prisma = getPrisma();
  const [regra, categorias, daSerie] = await Promise.all([
    prisma.financeRecurrence.findFirst({ where: { id: conta.recurrenceId, tenantId: ctx.tenantId }, select: { frequency: true, endMode: true, active: true } }),
    prisma.financeCategory.findMany({
      where: ondeDaEmpresa(ctx.tenantId, conta.companyId, { kind: conta.kind }),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    contasDaSerie(ctx.tenantId, conta.companyId, conta.recurrenceId, conta.recurrenceIndex),
  ]);
  const emAberto = contasDaquiEmDiante(
    daSerie.map((d) => d.conta),
    conta.recurrenceIndex,
    []
  ).mudam.length;

  return {
    ok: true,
    conta: {
      id: conta.id,
      kind: conta.kind,
      contraparte: conta.counterparty.name,
      posicao: rotuloDaSerie(conta) ?? "",
      valor: Number(centavosDeDecimal(conta.amount) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      categoriaId: conta.categoryId,
      descricao: conta.description,
      dia: Number(saoPauloParts(conta.dueDate).dateKey.slice(8, 10)),
    },
    categorias: categorias.map((c) => ({ id: c.id, nome: c.name })),
    emAberto,
    dia: !regra ? { pode: false, motivo: SERIE_ANTIGA } : !frequenciaComDiaDoMes(regra.frequency) ? { pode: false, motivo: SEM_DIA_DO_MES } : { pode: true },
    nascemSozinhas: Boolean(regra?.active && regra.endMode !== "VEZES"),
  };
}

export type ResultadoDaMudancaDaSerie = { error: string } | { ok: true; mudaram: number; ficaram: number; aviso: string | null };

/**
 * Grava a mudança nesta conta e nas próximas da série em aberto. Cada conta é
 * gravada condicionada ao `updatedAt` lido: a que foi paga ou editada no meio
 * fica como está e conta nas que ficaram. A conta a pagar aprovada que muda
 * de valor volta para a aprovação, como na janela "Editar". Uma linha de
 * auditoria para a mudança inteira, com as contas que mudaram.
 */
export async function mudarSerieDaquiEmDiante(formData: FormData): Promise<ResultadoDaMudancaDaSerie> {
  const texto = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  const tenantId = ctx.tenantId;
  const conta = await lerConta(tenantId, texto("entryId"));
  if (!conta) return { error: "Lançamento não encontrado." };
  const acesso = await podeEditarOTipo(conta.kind);
  if (!acesso.ctx) return { error: acesso.erro ?? "Sem permissão." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só grava nele.
  const foraDoFoco = await recusaDoFoco(ctx, [conta.companyId]);
  if (foraDoFoco) return { error: foraDoFoco };
  if (!conta.recurrenceId || !conta.recurrenceIndex) return { error: "Este lançamento não faz parte de uma série." };
  // A conta do Omie é dele até a virada (lote E): o que mudasse aqui voltaria
  // ao do Omie na leitura seguinte.
  if (presaAoOmie(conta, conta.company)) return { error: VEM_DO_OMIE };

  const lida = lerMudancaDaSerie({ valor: texto("valor"), categoryId: texto("categoryId"), descricao: texto("descricao"), dia: texto("dia") });
  if (!lida.ok) return { error: lida.erro };
  const m = lida.mudanca;
  const { companyId, kind, recurrenceId, recurrenceIndex } = conta;
  const prisma = getPrisma();

  if (m.categoriaId && m.categoriaId !== conta.categoryId) {
    const existe = await prisma.financeCategory.findFirst({ where: { ...categoriaDaEmpresa(tenantId, companyId, m.categoriaId, kind), active: true }, select: { id: true } });
    if (!existe) return { error: "Categoria não encontrada no plano desta empresa para este tipo de conta." };
  }

  const regra = await prisma.financeRecurrence.findFirst({
    where: { id: recurrenceId, tenantId },
    select: { id: true, frequency: true, dayAdjust: true, endMode: true, firstDueDate: true, active: true },
  });
  if (m.dia !== undefined) {
    if (!regra) return { error: SERIE_ANTIGA };
    if (!frequenciaComDiaDoMes(regra.frequency)) return { error: SEM_DIA_DO_MES };
  }

  const daSerie = await contasDaSerie(tenantId, companyId, recurrenceId, recurrenceIndex);
  const selecao = contasDaquiEmDiante(
    daSerie.map((d) => d.conta),
    recurrenceIndex,
    camposDaMudanca(m)
  );
  if (selecao.mudam.length === 0) {
    return { error: `Nenhuma conta desta posição em diante pode mudar${selecao.ficam[0] ? `: ${selecao.ficam[0].motivo}` : "."}` };
  }
  const linhaDe = new Map(daSerie.map((d) => [d.conta.id, d.linha]));
  const feriados = m.dia !== undefined ? new Set((await feriadosDoEscritorio(tenantId)).keys()) : new Set<string>();
  const entrada = m.centavos !== undefined && kind === "PAGAR" ? await contextoDeEntrada(tenantId, [companyId]) : null;

  // O que muda em cada conta — só o que é diferente do que ela já tem.
  const planos = selecao.mudam.map((c) => {
    const l = linhaDe.get(c.id)!;
    const data: Prisma.FinanceEntryUncheckedUpdateManyInput = {};
    if (m.centavos !== undefined && m.centavos !== centavosDeDecimal(l.amount)) data.amount = decimalDeCentavos(m.centavos);
    if (m.categoriaId !== undefined && m.categoriaId !== l.categoryId) data.categoryId = m.categoriaId;
    if (m.descricao !== undefined && m.descricao !== l.description) data.description = m.descricao;
    if (m.dia !== undefined && regra) {
      const key = vencimentoNaPosicao(regra.firstDueDate, regra.frequency as Frequencia, regra.dayAdjust as AjusteDoDia, c.indice, m.dia, feriados);
      if (key !== saoPauloParts(l.dueDate).dateKey) data.dueDate = instanteDaData(key);
    }
    const reenviar =
      "amount" in data &&
      aprovacaoDepoisDaEdicao({
        kind,
        approvalStatus: l.approvalStatus,
        mudouValor: true,
        mudouContraparte: false,
        entraria: entrada?.statusInicial(companyId, kind, l.status) === "AGUARDANDO",
      }) === "REENVIAR";
    if (reenviar) {
      data.approvalStatus = "AGUARDANDO";
      data.approvedAt = null;
    }
    return { conta: c, linha: l, data, reenviar };
  });
  const mudaDia = m.dia !== undefined && regra !== null;
  if (planos.every((p) => Object.keys(p.data).length === 0) && !mudaDia) {
    return { ok: true, mudaram: 0, ficaram: selecao.ficam.length, aviso: "Nada mudou — as contas já estavam assim." };
  }

  const gravadas = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    const reenviadas: string[] = [];
    for (const p of planos) {
      if (Object.keys(p.data).length === 0) continue;
      // A trava de estado: a baixa ou a edição que chegou antes não é sobrescrita.
      const r = await tx.financeEntry.updateMany({ where: { id: p.conta.id, tenantId, updatedAt: p.linha.updatedAt }, data: p.data });
      if (r.count !== 1) continue;
      ids.push(p.conta.id);
      if (p.reenviar) reenviadas.push(p.conta.id);
    }
    if (reenviadas.length > 0) await registrarEnvios(tx, reenviadas, ctx.userId || null);
    // O dia novo vale também para as que o agendador ainda vai criar.
    if (mudaDia && regra) await tx.financeRecurrence.update({ where: { id: regra.id }, data: { dueDay: m.dia } });
    return { ids, reenviadas };
  });

  const comMudanca = planos.filter((p) => Object.keys(p.data).length > 0).length;
  const perdidas = comMudanca - gravadas.ids.length;
  const ficaram = selecao.ficam.length + perdidas;
  const reenviadas = planos.filter((p) => gravadas.reenviadas.includes(p.conta.id));
  const avisoDeAprovacao =
    reenviadas.length > 0 ? await avisarAprovadores(tenantId, reenviadas.map(() => ({ companyId, amount: decimalDeCentavos(m.centavos!) }))) : null;

  // As que vão nascer copiam a última conta não cancelada da série: se ela
  // ficou de fora (paga adiantada, por exemplo), o valor novo não chega nelas.
  const nascemSozinhas = Boolean(regra?.active && regra.endMode !== "VEZES");
  const ultima = [...daSerie].reverse().find((d) => d.conta.status !== "CANCELADO");
  const ultimaFicou = ultima ? selecao.ficam.find((f) => f.id === ultima.conta.id) : undefined;
  const avisos = [
    reenviadas.length > 0 ? `${reenviadas.length === 1 ? "Uma conta aprovada voltou" : `${reenviadas.length} contas aprovadas voltaram`} para a aprovação.` : null,
    nascemSozinhas && ultimaFicou && (m.centavos !== undefined || m.categoriaId !== undefined || m.descricao !== undefined)
      ? `A última conta da série ficou como estava (${ultimaFicou.motivo.replace(/\.$/, "")}) — as que nascerem depois copiam dela o valor, a categoria e a descrição.`
      : null,
  ].filter(Boolean);

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "financeiro.entry.series_changed",
    entityType: "FinanceEntry",
    entityId: conta.id,
    metadata: {
      companyId,
      kind,
      serie: recurrenceId,
      aPartirDe: recurrenceIndex,
      pedido: {
        ...(m.centavos !== undefined ? { valor: decimalDeCentavos(m.centavos), valorAntes: conta.amount.toString() } : {}),
        ...(m.categoriaId !== undefined ? { categoria: m.categoriaId, categoriaAntes: conta.categoryId } : {}),
        ...(m.descricao !== undefined ? { descricao: m.descricao, descricaoAntes: conta.description } : {}),
        ...(m.dia !== undefined ? { dia: m.dia } : {}),
      },
      mudaram: gravadas.ids.length,
      contas: gravadas.ids,
      ficaram,
      ...(reenviadas.length > 0 ? { reenviadasParaAprovacao: reenviadas.length, emailsDeAprovacao: avisoDeAprovacao?.enviados ?? 0 } : {}),
      ...(mudaDia ? { diaDaRegra: m.dia } : {}),
    },
  });

  for (const p of ["/pagar", "/receber", "/lancamentos", "/fluxo-de-caixa", "/dre", "/dre/economica", "/dre/analises", "/aprovacoes"]) {
    revalidatePath(p);
  }
  return { ok: true, mudaram: gravadas.ids.length, ficaram, aviso: avisos.length > 0 ? avisos.join(" ") : null };
}
