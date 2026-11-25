// O que a aba "Previsto" lê, na equipe e no portal (25/11/2026, funcionalidade-837).
//
// Uma empresa por vez: o de-para e a data de caixa são da empresa. Lê as
// contas em aberto com a categoria, o de-para do cliente, a data de caixa e o
// saldo das contas (da conciliação), e entrega o previsto já somado — e, se o
// endereço pede uma célula, as contas dela.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { saldoBancarioDoEscopo } from "@/lib/financeiro/conciliacao/saldoDasContas";
import type { SaldoConsolidado } from "@/lib/financeiro/conciliacao/saldoConsolidado";
import { sugerirLinha } from "./sugestao";
import {
  contasDaCelula,
  diasSemBanco,
  montarPrevisto,
  type Celula,
  type Classificacao,
  type ContaDaCelula,
  type Granularidade,
  type Previsto,
  type RegrasDaData,
  type TituloDoPrevisto,
} from "./projecao";

/** O mesmo teto da projeção de hoje: passar disso é lançamento esquecido em aberto. */
const TETO_DE_CONTAS = 5_000;

export type DataDeCaixaDaEmpresa = { diasReceber: number; diasPagar: number };

export async function dataDeCaixaDaEmpresa(tenantId: string, companyId: string): Promise<DataDeCaixaDaEmpresa> {
  const c = await getPrisma().cashFlowSettings.findFirst({
    where: { tenantId, companyId },
    select: { receivableDays: true, payableDays: true },
  });
  return { diasReceber: c?.receivableDays ?? 0, diasPagar: c?.payableDays ?? 0 };
}

export type DadosDoPrevisto = {
  previsto: Previsto;
  saldo: SaldoConsolidado;
  dataDeCaixa: DataDeCaixaDaEmpresa;
  /** A empresa tem categorias do cliente: a grade sai na nomenclatura dela. */
  comNomenclaturaDoCliente: boolean;
  noTeto: boolean;
  celula: { celula: Celula; contas: ContaDaCelula[] } | null;
};

export async function dadosDoPrevisto(p: {
  tenantId: string;
  companyId: string;
  granularidade: Granularidade;
  celula: Celula | null;
  agora?: Date;
}): Promise<DadosDoPrevisto> {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(p.agora ?? new Date()).dateKey;
  const escopo = { tenantId: p.tenantId, companyIds: [p.companyId] };

  const [linhas, ligacoes, saldo, dataDeCaixa] = await Promise.all([
    prisma.financeEntry.findMany({
      where: { tenantId: p.tenantId, companyId: p.companyId, paidAt: null, status: { not: "CANCELADO" } },
      select: {
        id: true,
        kind: true,
        amount: true,
        paidPrincipal: true,
        dueDate: true,
        forecastDate: true,
        description: true,
        documentNumber: true,
        categoryId: true,
        category: { select: { name: true } },
        counterparty: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: TETO_DE_CONTAS,
    }),
    prisma.clientCategoryMapping.findMany({
      where: { tenantId: p.tenantId, companyId: p.companyId },
      select: { categoryId: true, clientCategory: { select: { name: true, line: true } } },
    }),
    saldoBancarioDoEscopo(escopo),
    dataDeCaixaDaEmpresa(p.tenantId, p.companyId),
  ]);

  const titulos: TituloDoPrevisto[] = linhas.map((l) => ({
    id: l.id,
    kind: l.kind,
    // O que falta: a baixa parcial já saiu do caixa e não volta a ser projetada.
    centavos: centavosDeDecimal(l.amount) - centavosDeDecimal(l.paidPrincipal),
    vencimentoKey: saoPauloParts(l.dueDate).dateKey,
    previsaoKey: l.forecastDate ? saoPauloParts(l.forecastDate).dateKey : null,
    categoryId: l.categoryId,
    contraparte: l.counterparty.name,
    descricao: [l.documentNumber, l.description].filter(Boolean).join(" · ") || null,
  }));
  const nomeDaCategoria = new Map(linhas.filter((l) => l.categoryId).map((l) => [l.categoryId!, l.category?.name ?? ""]));
  const doCliente = new Map(ligacoes.map((l) => [l.categoryId, l.clientCategory]));

  // A categoria do cliente, quando há; senão a do Omie, na linha sugerida pelo
  // nome; sem categoria, "outras" do lado da conta.
  const classificar = (t: TituloDoPrevisto): Classificacao => {
    if (!t.categoryId) return { linha: t.kind === "RECEBER" ? "outras_entradas" : "outras_saidas", item: "Sem categoria" };
    const c = doCliente.get(t.categoryId);
    if (c) return { linha: c.line, item: c.name };
    const nome = nomeDaCategoria.get(t.categoryId) || "Sem categoria";
    return { linha: sugerirLinha(nome, t.kind), item: nome };
  };

  const regras: RegrasDaData = { ...dataDeCaixa, semBanco: diasSemBanco(hojeKey) };
  const previsto = montarPrevisto({ titulos, classificar, regras, hojeKey, granularidade: p.granularidade, saldoInicial: saldo.centavos });

  return {
    previsto,
    saldo,
    dataDeCaixa,
    comNomenclaturaDoCliente: ligacoes.length > 0,
    noTeto: linhas.length >= TETO_DE_CONTAS,
    celula: p.celula ? { celula: p.celula, contas: contasDaCelula(p.celula, titulos, classificar, regras, hojeKey, p.granularidade) } : null,
  };
}
