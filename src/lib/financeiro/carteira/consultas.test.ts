import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa (22/10/2026): a leitura do painel da carteira junta as
// colunas por empresa com consultas agregadas — uma por coluna, nunca uma por
// empresa — e cada número sai com o filtro da tela de destino.

const db = vi.hoisted(() => ({
  companyService: { findMany: vi.fn() },
  financeEntry: { groupBy: vi.fn() },
  bankAccount: { findMany: vi.fn() },
  clientRequest: { groupBy: vi.fn() },
  bankStatementImport: { groupBy: vi.fn() },
  bankTransaction: { groupBy: vi.fn() },
  portalUser: { findMany: vi.fn() },
}));
const saldos = vi.hoisted(() => ({ saldosDasContas: vi.fn() }));
const portal = vi.hoisted(() => ({ lerContasDasEmpresas: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => db }));
vi.mock("@/lib/financeiro/conciliacao/saldoDasContas", () => saldos);
vi.mock("@/lib/portal/empresasDaContaDb", () => portal);

const { carregarCarteira } = await import("./consultas");

const AGORA = new Date("2026-10-22T15:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

function servico(companyId: string, nome: string, analista: { id: string; nome: string } | null = null) {
  return {
    companyId,
    responsibleUserId: analista?.id ?? null,
    responsible: analista ? { name: analista.nome } : null,
    company: { name: nome, displayName: null, cnpj: null },
  };
}

describe("carregarCarteira", () => {
  it("sem empresa no setor, não consulta mais nada", async () => {
    db.companyService.findMany.mockResolvedValue([]);
    expect(await carregarCarteira("t1", "bpo", "bpo", AGORA)).toEqual([]);
    expect(db.financeEntry.groupBy).not.toHaveBeenCalled();
    expect(db.companyService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t1", sectorCode: "bpo", status: "ACTIVE" }),
      })
    );
  });

  it("monta uma linha por empresa, com as somas de cada coluna", async () => {
    db.companyService.findMany.mockResolvedValue([servico("e1", "Alfa", { id: "u1", nome: "Ana" }), servico("e2", "Beta")]);
    db.financeEntry.groupBy.mockImplementation(async (args: { by: string[] }) =>
      args.by.includes("kind")
        ? [
            { companyId: "e1", kind: "PAGAR", _count: { _all: 2 }, _sum: { amount: "150.00", paidPrincipal: "50.00" } },
            { companyId: "e2", kind: "RECEBER", _count: { _all: 1 }, _sum: { amount: "80.10", paidPrincipal: null } },
          ]
        : [{ companyId: "e2", _count: { _all: 3 } }]
    );
    db.bankAccount.findMany.mockResolvedValue([
      { id: "c1", companyId: "e1", type: "CORRENTE", active: true, openingBalance: "0", openingBalanceDate: new Date("2026-01-01T12:00:00Z") },
      { id: "c2", companyId: "e1", type: "CORRENTE", active: true, openingBalance: null, openingBalanceDate: null },
      { id: "c3", companyId: "e2", type: "CORRENTE", active: false, openingBalance: null, openingBalanceDate: null },
    ]);
    db.clientRequest.groupBy.mockResolvedValue([{ companyId: "e1", _count: { _all: 4 } }]);
    portal.lerContasDasEmpresas.mockResolvedValue(
      new Map([
        ["e1", new Map([["p1", { tipo: "direto", incluiFiliais: true }], ["p2", { tipo: "direto", incluiFiliais: true }]])],
        ["e2", new Map([["p3", { tipo: "direto", incluiFiliais: true }]])],
      ])
    );
    db.bankStatementImport.groupBy.mockResolvedValue([
      { bankAccountId: "c1", _max: { createdAt: new Date("2026-10-10T15:00:00Z") } },
      { bankAccountId: "c2", _max: { createdAt: new Date("2026-10-15T15:00:00Z") } },
    ]);
    db.bankTransaction.groupBy.mockResolvedValue([
      { bankAccountId: "c1", _count: { _all: 5 } },
      { bankAccountId: "c3", _count: { _all: 2 } },
    ]);
    saldos.saldosDasContas.mockResolvedValue(
      new Map([["c1", { tipo: "conferido", divergenciaCentavos: 1234, calculadoNaDataCentavos: 0, calculadoCentavos: 0, bancoCentavos: 0, bancoDataKey: null }]])
    );
    // p3 inativo: não volta da consulta, e a empresa fica "sem acesso".
    db.portalUser.findMany.mockResolvedValue([
      { id: "p1", lastLoginAt: new Date("2026-10-01T12:00:00Z") },
      { id: "p2", lastLoginAt: new Date("2026-10-20T12:00:00Z") },
    ]);

    const linhas = await carregarCarteira("t1", "bpo", "bpo", AGORA);

    expect(linhas).toEqual([
      {
        companyId: "e1",
        nome: "Alfa",
        cnpj: null,
        analistaId: "u1",
        analistaNome: "Ana",
        vencidosPagar: { n: 2, centavos: 10_000 },
        vencidosReceber: { n: 0, centavos: 0 },
        contasComExtrato: 2,
        ultimoExtratoKey: "2026-10-15",
        linhasAConciliar: 5,
        contasComSaldoDivergente: 1,
        pendenciasAbertas: 4,
        aprovacoesAguardando: 0,
        ultimoAcessoPortal: new Date("2026-10-20T12:00:00Z"),
        acessosAoPortal: 2,
      },
      {
        companyId: "e2",
        nome: "Beta",
        cnpj: null,
        analistaId: null,
        analistaNome: null,
        vencidosPagar: { n: 0, centavos: 0 },
        vencidosReceber: { n: 1, centavos: 8_010 },
        contasComExtrato: 0,
        ultimoExtratoKey: null,
        // Linha pendente em conta inativa continua a conciliar, como na tela da conciliação.
        linhasAConciliar: 2,
        contasComSaldoDivergente: 0,
        pendenciasAbertas: 0,
        aprovacoesAguardando: 3,
        ultimoAcessoPortal: null,
        acessosAoPortal: 0,
      },
    ]);

    // Só a conta com saldo inicial vai para a conferência do saldo.
    expect(saldos.saldosDasContas).toHaveBeenCalledWith("t1", [expect.objectContaining({ id: "c1" })]);
    // A data do extrato é só das contas ativas.
    expect(db.bankStatementImport.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1", bankAccountId: { in: ["c1", "c2"] } } })
    );
    // Vencidas pelo recorte da tela de contas: em aberto e antes do começo de hoje.
    const vencidas = db.financeEntry.groupBy.mock.calls.find(([a]) => a.by.includes("kind"))![0];
    expect(vencidas.where).toMatchObject({
      tenantId: "t1",
      companyId: { in: ["e1", "e2"] },
      paidAt: null,
      status: { notIn: ["CANCELADO", "PAGO"] },
      dueDate: { lt: new Date("2026-10-22T03:00:00Z") },
    });
    // Aprovações: contas a pagar aguardando.
    const aprov = db.financeEntry.groupBy.mock.calls.find(([a]) => !a.by.includes("kind"))![0];
    expect(aprov.where).toMatchObject({ kind: "PAGAR", approvalStatus: "AGUARDANDO" });
    // Pendências em andamento, do setor do BPO e as antigas sem setor.
    expect(db.clientRequest.groupBy.mock.calls[0]![0].where).toEqual({
      AND: [
        { tenantId: "t1", companyId: { in: ["e1", "e2"] }, status: { in: ["ABERTA", "RESPONDIDA"] } },
        { OR: [{ sectorCode: { in: ["bpo"] } }, { sectorCode: null }] },
      ],
    });
    // Uma consulta por coluna, quantas forem as empresas.
    expect(db.financeEntry.groupBy).toHaveBeenCalledTimes(2);
    expect(db.portalUser.findMany).toHaveBeenCalledTimes(1);
  });
});
