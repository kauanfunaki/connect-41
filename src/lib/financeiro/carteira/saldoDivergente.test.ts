import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa (23/10/2026): o painel da carteira deixou de usar
// `saldosDasContas` (o histórico inteiro de cada conta, dia a dia) e passou a
// somar só a janela entre o saldo inicial e o saldo do banco
// (`contasComSaldoDivergente`). O veredito tem de ser o mesmo: aqui as duas
// rodam sobre o mesmo banco de mentira, que entende os filtros que as duas
// usam, e a conta divergente de uma é a divergente da outra.

type Transacao = { tenantId: string; bankAccountId: string; postedAt: Date; amount: string };
type Importacao = { tenantId: string; bankAccountId: string; ledgerBalance: string | null; ledgerBalanceAt: Date | null; createdAt: Date };

const banco = vi.hoisted(() => ({ transacoes: [] as Transacao[], importacoes: [] as Importacao[] }));

type Filtro = Record<string, unknown>;

function casa(linha: Record<string, unknown>, where: Filtro): boolean {
  return Object.entries(where).every(([campo, cond]) => {
    if (campo === "OR") return (cond as Filtro[]).some((w) => casa(linha, w));
    const valor = linha[campo];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; not?: unknown; gte?: Date; lt?: Date };
      if (c.in && !c.in.includes(valor)) return false;
      if ("not" in c && valor === c.not) return false;
      if (c.gte && !((valor as Date) >= c.gte)) return false;
      if (c.lt && !((valor as Date) < c.lt)) return false;
      return true;
    }
    return valor === cond;
  });
}

function somar(valores: string[]): string {
  const centavos = valores.reduce((s, v) => s + Math.round(Number(v) * 100), 0);
  return (centavos / 100).toFixed(2);
}

const db = vi.hoisted(() => ({
  bankTransaction: {
    groupBy: async (args: { by: string[]; where: Filtro }) => {
      const grupos = new Map<string, Transacao[]>();
      for (const t of banco.transacoes.filter((t) => casa(t, args.where))) {
        const chave = args.by.map((c) => String((t as Record<string, unknown>)[c] instanceof Date ? ((t as Record<string, unknown>)[c] as Date).toISOString() : (t as Record<string, unknown>)[c])).join("|");
        grupos.set(chave, [...(grupos.get(chave) ?? []), t]);
      }
      return [...grupos.values()].map((ts) => ({
        ...Object.fromEntries(args.by.map((c) => [c, (ts[0] as Record<string, unknown>)[c]])),
        _sum: { amount: somar(ts.map((t) => t.amount)) },
      }));
    },
  },
  bankStatementImport: {
    findMany: async (args: { where: Filtro }) => banco.importacoes.filter((i) => casa(i, args.where)),
  },
  financeEntryPayment: { findMany: async () => [] },
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));

const { contasComSaldoDivergente } = await import("./consultas");
const { saldosDasContas } = await import("@/lib/financeiro/conciliacao/saldoDasContas");

/** O meio-dia em Brasília do dia — como o `postedAt` que a importação grava. */
const dia = (key: string) => new Date(`${key}T12:00:00-03:00`);

function transacao(conta: string, key: string, amount: string): Transacao {
  return { tenantId: "t1", bankAccountId: conta, postedAt: dia(key), amount };
}
function importacao(conta: string, ledgerBalance: string | null, ledgerKey: string | null, importadoKey = "2026-10-20"): Importacao {
  return { tenantId: "t1", bankAccountId: conta, ledgerBalance, ledgerBalanceAt: ledgerKey ? dia(ledgerKey) : null, createdAt: dia(importadoKey) };
}
function conta(id: string, openingBalance: string | null, openingKey: string | null) {
  return { id, type: "CORRENTE", openingBalance, openingBalanceDate: openingKey ? dia(openingKey) : null };
}

async function divergentesPelaConciliacao(contas: ReturnType<typeof conta>[]): Promise<Set<string>> {
  const saldos = await saldosDasContas("t1", contas);
  return new Set([...saldos].filter(([, s]) => s.tipo === "conferido" && s.divergenciaCentavos !== 0).map(([id]) => id));
}

beforeEach(() => {
  banco.transacoes = [];
  banco.importacoes = [];
});

describe("contasComSaldoDivergente — o mesmo veredito de saldosDasContas", () => {
  it("cobre bate, não bate, sem saldo inicial, sem extrato e os limites da janela", async () => {
    const contas = [
      // Bate: 100 + 50 − 30 = 120 em 10/10; o que entrou depois do corte não conta.
      conta("bate", "100.00", "2026-10-01"),
      // Não bate por um centavo.
      conta("diverge", "100.00", "2026-10-01"),
      // Sem saldo inicial: nunca chega a "conferido".
      conta("sem-inicial", null, null),
      // Sem nenhuma importação com saldo do banco.
      conta("sem-extrato", "10.00", "2026-10-01"),
      // Saldo do banco anterior ao saldo inicial: não há janela.
      conta("banco-anterior", "0", "2026-10-05"),
      // Importação sem DTASOF: compara com tudo desde o saldo inicial.
      conta("sem-data", "0", "2026-10-01"),
      // Transação de antes do saldo inicial fica fora; as do dia do inicial e do dia do corte entram.
      conta("limites", "0", "2026-10-03"),
      // Sem transação nenhuma na janela: o calculado é o inicial.
      conta("parada", "75.00", "2026-10-01"),
    ];
    banco.transacoes = [
      transacao("bate", "2026-10-02", "50.00"),
      transacao("bate", "2026-10-09", "-30.00"),
      transacao("bate", "2026-10-15", "999.00"),
      transacao("diverge", "2026-10-02", "50.01"),
      transacao("sem-inicial", "2026-10-02", "5.00"),
      transacao("sem-extrato", "2026-10-02", "5.00"),
      transacao("banco-anterior", "2026-10-06", "5.00"),
      transacao("sem-data", "2026-10-02", "1.00"),
      transacao("sem-data", "2026-10-22", "2.00"),
      transacao("limites", "2026-10-02", "1000.00"),
      transacao("limites", "2026-10-03", "10.00"),
      transacao("limites", "2026-10-08", "5.00"),
      transacao("limites", "2026-10-09", "700.00"),
      // Outra empresa (outro tenant) nunca entra.
      { tenantId: "t2", bankAccountId: "parada", postedAt: dia("2026-10-02"), amount: "1.00" },
    ];
    banco.importacoes = [
      importacao("bate", "120.00", "2026-10-10"),
      // A de referência é a de DTASOF mais recente, não a última importada.
      importacao("bate", "80.00", "2026-10-05", "2026-10-21"),
      importacao("diverge", "150.00", "2026-10-10"),
      importacao("sem-inicial", "5.00", "2026-10-10"),
      importacao("sem-extrato", null, "2026-10-10"),
      importacao("banco-anterior", "5.00", "2026-10-01"),
      importacao("sem-data", "3.00", null),
      importacao("limites", "15.00", "2026-10-08"),
      importacao("parada", "75.00", "2026-10-10"),
    ];

    const pelaConciliacao = await divergentesPelaConciliacao(contas);
    const peloPainel = await contasComSaldoDivergente("t1", contas);

    expect(pelaConciliacao).toEqual(new Set(["diverge"]));
    expect(peloPainel).toEqual(pelaConciliacao);
  });

  it("acompanha a conciliação quando o caso vira: falta extrato, depois completa", async () => {
    const contas = [conta("c1", "0", "2026-10-01")];
    banco.importacoes = [importacao("c1", "30.00", "2026-10-10")];
    banco.transacoes = [transacao("c1", "2026-10-02", "10.00")];
    expect(await contasComSaldoDivergente("t1", contas)).toEqual(await divergentesPelaConciliacao(contas));
    expect((await contasComSaldoDivergente("t1", contas)).has("c1")).toBe(true);

    banco.transacoes.push(transacao("c1", "2026-10-10", "20.00"));
    expect(await contasComSaldoDivergente("t1", contas)).toEqual(await divergentesPelaConciliacao(contas));
    expect((await contasComSaldoDivergente("t1", contas)).size).toBe(0);
  });

  it("sem conta com saldo inicial, não consulta o banco", async () => {
    const findMany = vi.spyOn(db.bankStatementImport, "findMany");
    expect(await contasComSaldoDivergente("t1", [conta("c1", null, null)])).toEqual(new Set());
    expect(findMany).not.toHaveBeenCalled();
  });
});
