// A consulta das contas a pagar e a receber.
//
// Separada de `contas.ts`, que é regra pura e testada. Aqui só o que toca o
// banco — e a montagem das linhas que a tela lê.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import {
  situacaoDaConta,
  totalizar,
  ordenarContas,
  centavosDeDecimal,
  type SituacaoDaConta,
  type Totais,
} from "./contas";

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
  /** Documento fiscal que originou, quando veio de um. */
  documentoId: string | null;
};

export type FiltroDeContas = {
  competencia?: string;
  empresaId?: string;
  /** "abertas" esconde pago e cancelado — é o recorte de trabalho. */
  recorte?: "abertas" | "vencidas" | "todas";
};

export type ResultadoDeContas = {
  linhas: LinhaDaConta[];
  totais: Totais;
  /** Quantas existem no tenant para este tipo, ignorando o recorte. */
  totalGeral: number;
};

/**
 * As contas de um tipo, já com situação, totais e ordem.
 *
 * O recorte é aplicado **depois** de calcular a situação, porque situação é
 * derivada (vencida sai de vencimento × hoje, não de coluna) e não dá para
 * filtrar no banco sem duplicar a regra em SQL — que é como as duas versões
 * começam a discordar.
 */
export async function listarContas(
  tenantId: string,
  kind: TipoDeConta,
  filtro: FiltroDeContas,
  agora: Date
): Promise<ResultadoDeContas> {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(agora).dateKey;

  const entradas = await prisma.financeEntry.findMany({
    where: {
      tenantId,
      kind,
      competence: filtro.competencia || undefined,
      companyId: filtro.empresaId || undefined,
    },
    select: {
      id: true,
      status: true,
      amount: true,
      dueDate: true,
      paidAt: true,
      competence: true,
      description: true,
      fiscalDocumentId: true,
      company: { select: { id: true, name: true, displayName: true } },
      counterparty: { select: { name: true } },
      category: { select: { name: true } },
    },
    // Teto defensivo: a tela é para trabalhar o mês, não para inventariar o
    // histórico inteiro. Passando disto, o que falta é filtro.
    take: 1000,
  });

  const todas: LinhaDaConta[] = entradas.map((e) => {
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
      documentoId: e.fiscalDocumentId,
    };
  });

  const recorte = filtro.recorte ?? "abertas";
  const recortadas =
    recorte === "todas"
      ? todas
      : recorte === "vencidas"
        ? todas.filter((l) => l.situacao === "VENCIDA")
        : todas.filter(
            (l) =>
              l.situacao === "VENCIDA" || l.situacao === "VENCE_HOJE" || l.situacao === "A_VENCER"
          );

  return {
    linhas: ordenarContas(recortadas),
    // Os totais são do recorte que está na tela — somar o que não está à vista
    // faria o número do topo não bater com a lista embaixo.
    totais: totalizar(recortadas),
    totalGeral: todas.length,
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
