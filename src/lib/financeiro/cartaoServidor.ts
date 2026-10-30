// Cartão de crédito (lote D, 20/10): o credor e a categoria da fatura, e o que
// a tela de Contas a pagar mostra — os cartões, as faturas e as compras de cada
// uma. As regras moram em `cartao.ts`; a fatura é refeita na baixa, em
// `baixa/servidor.ts`.

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { TRANSFERENCIA } from "@/lib/dre/estrutura";
import { ondeDaEmpresa } from "./planoDeContas";
import { centavosDeDecimal } from "./contas";
import { cicloDoMes, NOME_DA_CATEGORIA_DA_FATURA, situacaoDaFatura, type SituacaoDaFatura } from "./cartao";
import { CARTAO_DE_CREDITO } from "./tiposDeConta";

type Tx = Prisma.TransactionClient;
type Cliente = Tx | ReturnType<typeof getPrisma>;

/** Quem recebe a fatura: o próprio cartão, como fornecedor da empresa — achado pelo nome, ou criado. */
export async function credorDaFatura(tx: Tx, tenantId: string, companyId: string, nome: string): Promise<string> {
  const achado = await tx.financeCounterparty.findFirst({ where: { tenantId, companyId, name: nome }, select: { id: true } });
  if (achado) return achado.id;
  return (await tx.financeCounterparty.create({ data: { tenantId, companyId, name: nome }, select: { id: true } })).id;
}

/**
 * A categoria da fatura, fora da DRE: a despesa entrou em cada compra, e
 * contar a fatura de novo seria contar duas vezes. A da empresa vence a do
 * padrão, a ativa vence a inativa; sem nenhuma, nasce no padrão do escritório.
 */
export async function categoriaDaFatura(tx: Tx, tenantId: string, companyId: string): Promise<string> {
  const candidatas = await tx.financeCategory.findMany({
    where: { ...ondeDaEmpresa(tenantId, companyId, { kind: "PAGAR", apenasAtivas: false, incluirOcultas: true }), name: NOME_DA_CATEGORIA_DA_FATURA },
    select: { id: true, companyId: true, active: true },
  });
  const achada = candidatas.sort((a, b) => Number(b.active) - Number(a.active) || Number(b.companyId !== null) - Number(a.companyId !== null))[0];
  if (achada) return achada.id;
  const criada = await tx.financeCategory.create({
    data: { tenantId, scope: "", name: NOME_DA_CATEGORIA_DA_FATURA, kind: "PAGAR", dreGroup: TRANSFERENCIA },
    select: { id: true },
  });
  return criada.id;
}

export type CartaoParaABaixa = { id: string; nome: string; fechamento: number; vencimento: number };

/** Os cartões ativos da empresa, com os dias — a janela da baixa diz em que fatura a compra entra. */
export async function cartoesParaABaixa(cliente: Cliente, tenantId: string, companyId: string): Promise<CartaoParaABaixa[]> {
  const cartoes = await cliente.bankAccount.findMany({
    where: { tenantId, companyId, type: CARTAO_DE_CREDITO, active: true },
    select: { id: true, nickname: true, accountNumber: true, cardClosingDay: true, cardDueDay: true },
    orderBy: { nickname: "asc" },
  });
  return cartoes
    .filter((c) => c.cardClosingDay && c.cardDueDay)
    .map((c) => ({ id: c.id, nome: `${c.nickname} ${c.accountNumber}`, fechamento: c.cardClosingDay!, vencimento: c.cardDueDay! }));
}

export type CompraDaFatura = { paymentId: string; dataKey: string; centavos: number; contraparteNome: string; descricao: string | null };

export type FaturaDoCartao = {
  id: string;
  ciclo: string;
  fechamentoKey: string;
  vencimentoKey: string;
  valorCentavos: number;
  situacao: SituacaoDaFatura;
  compras: CompraDaFatura[];
};

export type CartaoDaEmpresa = {
  id: string;
  nome: string;
  bankCode: string;
  accountNumber: string;
  fechamento: number | null;
  vencimento: number | null;
  /** O limite lido do Omie (30/10/2026), em centavos; nulo sem ele. */
  limiteCentavos: number | null;
  ativo: boolean;
  faturas: FaturaDoCartao[];
};

/** Quantas faturas de cada cartão a tela mostra: as mais recentes, abertas ou pagas. */
const FATURAS_NA_TELA = 3;

/** Os cartões da empresa, com as faturas mais recentes e as compras de cada uma. */
export async function cartoesDaEmpresa(cliente: Cliente, tenantId: string, companyId: string): Promise<CartaoDaEmpresa[]> {
  const cartoes = await cliente.bankAccount.findMany({
    where: { tenantId, companyId, type: CARTAO_DE_CREDITO },
    select: {
      id: true,
      nickname: true,
      bankCode: true,
      accountNumber: true,
      cardClosingDay: true,
      cardDueDay: true,
      cardLimit: true,
      active: true,
      cardInvoices: {
        where: { status: { not: "CANCELADO" } },
        select: {
          id: true,
          cardCycle: true,
          dueDate: true,
          amount: true,
          status: true,
          paidPrincipal: true,
          cardPurchases: {
            select: { id: true, paidAt: true, cash: true, entry: { select: { description: true, counterparty: { select: { name: true } } } } },
            orderBy: { paidAt: "asc" },
          },
        },
        orderBy: { cardCycle: "desc" },
        take: FATURAS_NA_TELA,
      },
    },
    orderBy: [{ active: "desc" }, { nickname: "asc" }],
  });
  const hojeKey = saoPauloParts(new Date()).dateKey;
  return cartoes.map((c) => ({
    id: c.id,
    nome: c.nickname,
    bankCode: c.bankCode,
    accountNumber: c.accountNumber,
    fechamento: c.cardClosingDay,
    vencimento: c.cardDueDay,
    limiteCentavos: c.cardLimit === null ? null : centavosDeDecimal(c.cardLimit),
    ativo: c.active,
    faturas: c.cardInvoices.map((f) => {
      const ciclo = f.cardCycle ?? "";
      // Quando fecha, pelos dias de agora: só a tela usa, e a compra já está na fatura dela.
      const fechamentoKey = c.cardClosingDay && c.cardDueDay ? cicloDoMes(ciclo, { fechamento: c.cardClosingDay, vencimento: c.cardDueDay }).fechamentoKey : "";
      return {
        id: f.id,
        ciclo,
        fechamentoKey,
        vencimentoKey: saoPauloParts(f.dueDate).dateKey,
        valorCentavos: centavosDeDecimal(f.amount),
        situacao: situacaoDaFatura({ status: f.status, baixadoCentavos: centavosDeDecimal(f.paidPrincipal), fechamentoKey }, hojeKey),
        compras: f.cardPurchases.map((p) => ({
          paymentId: p.id,
          dataKey: saoPauloParts(p.paidAt).dateKey,
          centavos: centavosDeDecimal(p.cash),
          contraparteNome: p.entry.counterparty.name,
          descricao: p.entry.description,
        })),
      };
    }),
  }));
}
