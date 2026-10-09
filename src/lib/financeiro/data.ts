// A consulta das contas a pagar e a receber.
//
// Separada de `contas.ts`, que é regra pura e testada. Aqui só o que toca o
// banco — e a montagem das linhas que a tela lê.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { saoPauloParts, addDaysToKey } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import {
  situacaoDaConta,
  totaisDoRecorte,
  ordenarContas,
  centavosDeDecimal,
  type RecorteDeContas,
  type SituacaoDaConta,
  type Totais,
} from "./contas";
import { inicioDeHoje, totaisDoEscopo } from "./consultas";

export type TipoDeConta = "PAGAR" | "RECEBER";

export type LinhaDaConta = {
  id: string;
  situacao: SituacaoDaConta;
  valorCentavos: number;
  vencimentoKey: string;
  vencimento: Date;
  pagoEm: Date | null;
  competencia: string;
  descricao: string | null;
  empresaId: string;
  empresaNome: string;
  contraparteNome: string;
  categoriaNome: string | null;
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  /** Aprovação por alçada — AGUARDANDO e REPROVADO travam a baixa. */
  approvalStatus: "NAO_REQUER" | "AGUARDANDO" | "APROVADO" | "REPROVADO";
  /** Documento fiscal que originou, quando veio de um. */
  documentoId: string | null;
  /** Por que saiu do em aberto, quando cancelada — renegociada e perda aparecem com o nome. */
  closeReason: "CANCELADO" | "RENEGOCIADO" | "PERDA" | null;
  /** Parcela de acordo de cobrança. */
  parcelaDeAcordo: boolean;
  centroDeCustoId: string | null;
  centroDeCustoNome: string | null;
};

export type FiltroDeContas = {
  competencia?: string;
  empresaId?: string;
  /** "abertas" esconde pago e cancelado — é o recorte de trabalho. */
  recorte?: RecorteDeContas;
};

export type ResultadoDeContas = {
  linhas: LinhaDaConta[];
  /** Somados no banco, sobre o recorte inteiro — não só sobre as linhas que vieram. */
  totais: Totais;
  /** Quantas existem para este tipo com os filtros de competência e empresa, ignorando o recorte. */
  totalGeral: number;
  /** Quantas o recorte tem. Passa de `linhas.length` quando a lista parou no teto. */
  totalNoRecorte: number;
  /** A lista parou em `LIMITE_DE_CONTAS`: a tela avisa, e a contagem vira "1.000+". */
  limitada: boolean;
};

/**
 * Teto de linhas da lista — não dos totais, que são somados no banco.
 *
 * A tela é para trabalhar o mês, não para inventariar o histórico inteiro.
 * Passando disto, o que falta é filtro, e a tela diz isso.
 */
export const LIMITE_DE_CONTAS = 1000;

const ABERTAS: Prisma.FinanceEntryWhereInput = { paidAt: null, status: { notIn: ["CANCELADO", "PAGO"] } };

/**
 * O recorte em SQL, com as regras de `situacaoDaConta`: em aberto é nem paga
 * (status PAGO ou com baixa) nem cancelada; vencida é a em aberto com
 * vencimento antes do começo de hoje em São Paulo — o mesmo corte de
 * `totaisDoEscopo`, que o portal usa desde 07/10.
 */
export function whereDoRecorte(recorte: RecorteDeContas, hojeKey: string): Prisma.FinanceEntryWhereInput {
  if (recorte === "todas") return {};
  const amanha = inicioDeHoje(addDaysToKey(hojeKey, 1));
  if (recorte === "avencer") return { ...ABERTAS, dueDate: { gte: amanha } };
  if (recorte === "hoje") return { ...ABERTAS, dueDate: { gte: inicioDeHoje(hojeKey), lt: amanha } };
  if (recorte === "vencidas") return { ...ABERTAS, dueDate: { lt: inicioDeHoje(hojeKey) } };
  return ABERTAS;
}

/** O que não está em aberto: paga ou cancelada. Só o recorte "todas" traz. */
const FECHADAS: Prisma.FinanceEntryWhereInput = {
  OR: [{ status: { in: ["CANCELADO", "PAGO"] } }, { paidAt: { not: null } }],
};

const CAMPOS = {
  id: true,
  status: true,
  amount: true,
  dueDate: true,
  paidAt: true,
  competence: true,
  description: true,
  fiscalDocumentId: true,
  approvalStatus: true,
  closeReason: true,
  agreementId: true,
  company: { select: { id: true, name: true, displayName: true } },
  counterparty: { select: { name: true } },
  category: { select: { name: true } },
  costCenterId: true,
  costCenter: { select: { name: true } },
} satisfies Prisma.FinanceEntrySelect;

/**
 * As contas de um tipo, já com situação, totais e ordem.
 *
 * ─── Por que a consulta mudou (08/10/2026) ──────────────────────────────────
 *
 * Até aqui era um `findMany` com `take: 1000` e **sem `orderBy`**, e o recorte
 * e os totais saíam dessas mil linhas, no JavaScript. Acima de mil contas no
 * filtro (o histórico pago conta, mesmo no recorte "em aberto"), o banco
 * devolvia mil linhas quaisquer: a lista e os cartões do topo perdiam contas
 * sem aviso — inclusive vencidas, que são o motivo da tela.
 *
 * Agora:
 * - o recorte vai para o banco (`whereDoRecorte`), e o teto vale só para o
 *   que a tela mostra;
 * - a ordem é estável — vencimento e id —, e em aberto ela já é a ordem da
 *   fila (vencida, vence hoje, a vencer), então o corte, se houver, deixa de
 *   fora o vencimento mais distante, nunca a vencida;
 * - em "todas", as em aberto vêm primeiro e o histórico (paga, cancelada)
 *   completa até o teto, do mais recente para o mais antigo;
 * - os totais e as contagens são do banco (`totaisDoEscopo`, `count`), sem
 *   teto, e a tela avisa quando a lista está limitada.
 */
export async function listarContas(
  tenantId: string,
  kind: TipoDeConta,
  filtro: FiltroDeContas,
  agora: Date
): Promise<ResultadoDeContas> {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(agora).dateKey;
  const recorte = filtro.recorte ?? "abertas";

  const doFiltro: Prisma.FinanceEntryWhereInput = {
    tenantId,
    kind,
    ...(filtro.competencia ? { competence: filtro.competencia } : {}),
    ...(filtro.empresaId ? { companyId: filtro.empresaId } : {}),
  };
  // "todas" começa pelas em aberto; o histórico entra depois, até o teto.
  const daFila: Prisma.FinanceEntryWhereInput = {
    ...doFiltro,
    ...whereDoRecorte(recorte === "todas" ? "abertas" : recorte, hojeKey),
  };

  const [naFila, totalGeral, totalNoRecorte, somas] = await Promise.all([
    prisma.financeEntry.findMany({
      where: daFila,
      select: CAMPOS,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: LIMITE_DE_CONTAS,
    }),
    prisma.financeEntry.count({ where: doFiltro }),
    prisma.financeEntry.count({ where: { ...doFiltro, ...whereDoRecorte(recorte, hojeKey) } }),
    totaisDoEscopo(
      { tenantId, companyIds: filtro.empresaId ? [filtro.empresaId] : null },
      kind,
      hojeKey,
      { competencia: filtro.competencia || undefined }
    ),
  ]);

  const vagas = LIMITE_DE_CONTAS - naFila.length;
  const historico =
    recorte === "todas" && vagas > 0
      ? await prisma.financeEntry.findMany({
          where: { ...doFiltro, ...FECHADAS },
          select: CAMPOS,
          orderBy: [{ dueDate: "desc" }, { id: "desc" }],
          take: vagas,
        })
      : [];

  const linhas: LinhaDaConta[] = [...naFila, ...historico].map((e) => {
    const vencimentoKey = saoPauloParts(e.dueDate).dateKey;
    return {
      id: e.id,
      situacao: situacaoDaConta(e, hojeKey, vencimentoKey),
      valorCentavos: centavosDeDecimal(e.amount),
      vencimentoKey,
      vencimento: e.dueDate,
      pagoEm: e.paidAt,
      competencia: e.competence,
      descricao: e.description,
      empresaId: e.company.id,
      empresaNome: nomeExibicao(e.company),
      contraparteNome: e.counterparty.name,
      categoriaNome: e.category?.name ?? null,
      status: e.status,
      approvalStatus: e.approvalStatus,
      documentoId: e.fiscalDocumentId,
      closeReason: e.closeReason,
      parcelaDeAcordo: e.agreementId !== null,
      centroDeCustoId: e.costCenterId,
      centroDeCustoNome: e.costCenter?.name ?? null,
    };
  });

  return {
    linhas: ordenarContas(linhas),
    totais: totaisDoRecorte(somas, recorte),
    totalGeral,
    totalNoRecorte,
    limitada: totalNoRecorte > linhas.length,
  };
}

/** Competências que têm lançamento deste tipo, para o filtro. */
export async function competenciasComContas(
  tenantId: string,
  kind: TipoDeConta
): Promise<string[]> {
  const prisma = getPrisma();
  const linhas = await prisma.financeEntry.groupBy({
    by: ["competence"],
    where: { tenantId, kind },
    orderBy: { competence: "desc" },
    take: 36,
  });
  return linhas.map((l) => l.competence);
}
