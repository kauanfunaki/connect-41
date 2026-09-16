// A consulta do saldo das contas bancárias — usada pela conciliação (por conta)
// e pelo fluxo de caixa, runway e CFO (consolidado do escopo). As regras estão
// em `saldo.ts` e `saldoConsolidado.ts`; aqui só o banco.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import type { EscopoFinanceiro } from "@/lib/financeiro/consultas";
import { situacaoDoSaldo, saldoDeReferencia, type SituacaoDoSaldo } from "./saldo";
import { saldoAtualDaConta, consolidarSaldos, type SaldoConsolidado } from "./saldoConsolidado";

type ContaParaSaldo = {
  id: string;
  openingBalance: { toString(): string } | null;
  openingBalanceDate: Date | null;
};

type SaldoCarregado = { situacao: SituacaoDoSaldo; ultimaMovimentacaoKey: string | null };

/**
 * Soma por dia no banco (`groupBy` em `postedAt`, que é sempre o meio-dia do
 * dia do extrato) em vez de trazer cada transação: uma conta movimentada tem
 * milhares de linhas por ano e só as somas interessam.
 */
async function carregarSaldos(tenantId: string, contas: ContaParaSaldo[]): Promise<Map<string, SaldoCarregado>> {
  const prisma = getPrisma();
  const ids = contas.map((c) => c.id);
  if (ids.length === 0) return new Map();
  const [porDia, importacoes] = await Promise.all([
    prisma.bankTransaction.groupBy({
      by: ["bankAccountId", "postedAt"],
      where: { tenantId, bankAccountId: { in: ids } },
      _sum: { amount: true },
    }),
    prisma.bankStatementImport.findMany({
      where: { tenantId, bankAccountId: { in: ids }, ledgerBalance: { not: null } },
      select: { bankAccountId: true, ledgerBalance: true, ledgerBalanceAt: true, createdAt: true },
    }),
  ]);

  const mapa = new Map<string, SaldoCarregado>();
  for (const c of contas) {
    const referencia = saldoDeReferencia(
      importacoes
        .filter((i) => i.bankAccountId === c.id)
        .map((i) => ({
          ledgerCentavos: i.ledgerBalance ? centavosDeDecimal(i.ledgerBalance) : null,
          ledgerKey: i.ledgerBalanceAt ? saoPauloParts(i.ledgerBalanceAt).dateKey : null,
          importadoEm: i.createdAt,
        }))
    );
    const transacoes = porDia
      .filter((d) => d.bankAccountId === c.id)
      .map((d) => ({ dataKey: saoPauloParts(d.postedAt).dateKey, centavos: d._sum.amount ? centavosDeDecimal(d._sum.amount) : 0 }));
    const ultimaMovimentacaoKey = transacoes.reduce<string | null>((m, t) => (m === null || t.dataKey > m ? t.dataKey : m), null);

    mapa.set(c.id, {
      situacao: situacaoDoSaldo({
        saldoInicialCentavos: c.openingBalance === null ? null : centavosDeDecimal(c.openingBalance),
        saldoInicialKey: c.openingBalanceDate ? saoPauloParts(c.openingBalanceDate).dateKey : null,
        transacoes,
        banco: referencia ? { centavos: referencia.ledgerCentavos!, dataKey: referencia.ledgerKey } : null,
      }),
      ultimaMovimentacaoKey,
    });
  }
  return mapa;
}

/** Situação do saldo de cada conta, para a tela de conciliação. */
export async function saldosDasContas(tenantId: string, contas: ContaParaSaldo[]): Promise<Map<string, SituacaoDoSaldo>> {
  const carregados = await carregarSaldos(tenantId, contas);
  return new Map([...carregados].map(([id, s]) => [id, s.situacao]));
}

/**
 * O saldo bancário consolidado das empresas do escopo — só contas **ativas**:
 * conta encerrada não tem dinheiro para somar ao caixa de hoje.
 */
export async function saldoBancarioDoEscopo(escopo: EscopoFinanceiro): Promise<SaldoConsolidado> {
  const prisma = getPrisma();
  const contas = await prisma.bankAccount.findMany({
    where: {
      tenantId: escopo.tenantId,
      active: true,
      ...(escopo.companyIds === null ? {} : { companyId: { in: escopo.companyIds } }),
    },
    select: {
      id: true,
      nickname: true,
      openingBalance: true,
      openingBalanceDate: true,
      company: { select: { name: true, displayName: true } },
    },
    orderBy: { nickname: "asc" },
  });

  const saldos = await carregarSaldos(escopo.tenantId, contas);
  // Com o tenant inteiro no escopo, o apelido sozinho ("Itaú") se repete entre
  // empresas: o nome da empresa vai junto.
  const comEmpresa = escopo.companyIds === null || escopo.companyIds.length > 1;
  return consolidarSaldos(
    contas.map((c) => {
      const s = saldos.get(c.id)!;
      return {
        id: c.id,
        nome: comEmpresa ? `${c.nickname} · ${nomeExibicao(c.company)}` : c.nickname,
        saldo: saldoAtualDaConta(s.situacao, s.ultimaMovimentacaoKey),
      };
    })
  );
}
