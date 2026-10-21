import { beforeEach, describe, expect, it, vi } from "vitest";

// O que as regras de conciliação gravam (fila do BPO, 21/10): na importação do
// extrato, só lançam sozinhas sem dúvida nenhuma — e nunca na empresa ainda
// lida do Omie —; e o desfazer cancela o lançamento que a regra criou.

const m = vi.hoisted(() => {
  const db = {
    bankAccount: { findFirst: vi.fn() },
    bankReconciliationRule: { findMany: vi.fn() },
    bankTransaction: { findMany: vi.fn(), updateMany: vi.fn() },
    bankTransactionMatch: { deleteMany: vi.fn() },
    bankRuleApplication: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    financeCounterparty: { findFirst: vi.fn() },
    financeCategory: { findFirst: vi.fn() },
    financeEntry: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    db,
    lidaDoOmie: vi.fn(),
    candidatos: vi.fn(),
    lancarEConciliar: vi.fn(),
    apagarBaixa: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/integracoes/omie/viradaServidor", () => ({ empresaLidaDoOmie: m.lidaDoOmie }));
vi.mock("./candidatos", () => ({ candidatosDaEmpresa: m.candidatos }));
vi.mock("./lancarDaTransacao", () => ({ lancarEConciliar: m.lancarEConciliar, RecusaDaLinha: class extends Error {} }));
vi.mock("../baixa/servidor", () => ({ apagarBaixa: m.apagarBaixa, RecusaDaBaixa: class extends Error {} }));
vi.mock("../centroDeCustoServidor", () => ({ centroNaCriacao: async () => ({ ok: true, centroId: null }) }));
vi.mock("../projetoServidor", () => ({ projetoInformado: async () => ({ ok: true, projetoId: null }) }));

import { desfazerLancamentoDaRegra, lancarPelasRegrasNaImportacao, RecusaDoDesfazer } from "./regrasServidor";

const REGRA = {
  id: "r1",
  companyId: "c1",
  name: "Tarifa",
  direction: "SAIDA",
  textContains: "TARIFA",
  minAmount: null,
  maxAmount: null,
  bankAccountId: null,
  counterpartyId: "banco",
  categoryId: "tarifas",
  costCenterId: null,
  projectId: null,
  description: null,
  mode: "LANCAR",
  active: true,
  counterparty: { name: "Banco Itaú" },
  category: { name: "Tarifas bancárias" },
  costCenter: null,
  project: null,
  bankAccount: null,
};

const LINHA = {
  id: "t1",
  bankAccountId: "itau",
  status: "PENDENTE",
  amount: "-12.90",
  postedAt: new Date("2026-10-15T15:00:00Z"),
  memo: "TARIFA BANCARIA PACOTE",
  payeeName: null,
  bankAccount: { companyId: "c1", type: "CORRENTE" },
};

const importacao = { tenantId: "e1", userId: "u1", bankAccountId: "itau", importId: "imp1" };

beforeEach(() => {
  vi.clearAllMocks();
  m.db.$transaction.mockImplementation(async (fn: (tx: typeof m.db) => unknown) => fn(m.db));
  m.db.bankAccount.findFirst.mockResolvedValue({ companyId: "c1" });
  m.db.bankReconciliationRule.findMany.mockResolvedValue([REGRA]);
  m.db.bankTransaction.findMany.mockResolvedValue([LINHA]);
  m.db.bankRuleApplication.findMany.mockResolvedValue([]);
  m.db.bankRuleApplication.create.mockResolvedValue({ id: "a1" });
  m.db.financeCounterparty.findFirst.mockResolvedValue({ id: "banco", active: true, defaultCostCenterId: null });
  m.db.financeCategory.findFirst.mockResolvedValue({ id: "tarifas" });
  m.lidaDoOmie.mockResolvedValue(false);
  m.candidatos.mockResolvedValue([]);
  m.lancarEConciliar.mockResolvedValue({ entryId: "conta-1" });
});

describe("lancarPelasRegrasNaImportacao", () => {
  it("lança e concilia a linha nova que a regra pega sem dúvida, e registra como automática", async () => {
    const r = await lancarPelasRegrasNaImportacao(importacao);
    expect(r).toEqual({ lancadas: 1, recusas: [] });
    expect(m.lancarEConciliar).toHaveBeenCalledWith(
      m.db,
      expect.objectContaining({
        tenantId: "e1",
        companyId: "c1",
        kind: "PAGAR",
        centavos: 1290,
        counterpartyId: "banco",
        categoryId: "tarifas",
        dataKey: "2026-10-15",
        competencia: "2026-10",
        descricao: "TARIFA BANCARIA PACOTE",
      })
    );
    expect(m.db.bankRuleApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ruleId: "r1", ruleName: "Tarifa", transactionId: "t1", financeEntryId: "conta-1", automatic: true }),
      })
    );
    // Só as linhas desta importação.
    expect(m.db.bankTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ importId: "imp1", status: "PENDENTE" }) }));
  });

  it("empresa ainda lida do Omie: não lança nada", async () => {
    m.lidaDoOmie.mockResolvedValue(true);
    expect(await lancarPelasRegrasNaImportacao(importacao)).toEqual({ lancadas: 0, recusas: [] });
    expect(m.lancarEConciliar).not.toHaveBeenCalled();
  });

  it("regra só em sugerir: não lança", async () => {
    m.db.bankReconciliationRule.findMany.mockResolvedValue([{ ...REGRA, mode: "SUGERIR" }]);
    expect(await lancarPelasRegrasNaImportacao(importacao)).toEqual({ lancadas: 0, recusas: [] });
    expect(m.lancarEConciliar).not.toHaveBeenCalled();
  });

  it("lançamento em aberto de mesmo valor: não lança, para não duplicar", async () => {
    m.candidatos.mockResolvedValue([
      {
        id: "aberta",
        kind: "PAGAR",
        status: "CONFERIDO",
        centavos: 1290,
        vencimentoKey: "2026-10-15",
        pagoEmKey: null,
        contraparteNome: "Banco Itaú",
        contraparteDocumento: null,
        conciliado: false,
      },
    ]);
    expect((await lancarPelasRegrasNaImportacao(importacao)).lancadas).toBe(0);
    expect(m.lancarEConciliar).not.toHaveBeenCalled();
  });

  it("alguém já desfez o que a regra lançou nesta linha: não lança de novo", async () => {
    m.db.bankRuleApplication.findMany.mockResolvedValue([{ transactionId: "t1", ruleId: "r1" }]);
    expect((await lancarPelasRegrasNaImportacao(importacao)).lancadas).toBe(0);
    expect(m.lancarEConciliar).not.toHaveBeenCalled();
  });

  it("a categoria saiu do plano: não lança, e diz por quê", async () => {
    m.db.financeCategory.findFirst.mockResolvedValue(null);
    const r = await lancarPelasRegrasNaImportacao(importacao);
    expect(r.lancadas).toBe(0);
    expect(r.recusas).toEqual(['Regra "Tarifa": a categoria não vale mais para esta empresa — edite a regra.']);
  });
});

describe("desfazerLancamentoDaRegra", () => {
  const registro = (conta: object, linha: object = { status: "CONCILIADA", matches: [{ id: "v1", financeEntryId: "conta-1" }] }) => ({
    id: "a1",
    undoneAt: null,
    transactionId: "t1",
    financeEntryId: "conta-1",
    financeEntry: conta,
    transaction: linha,
  });

  beforeEach(() => {
    m.db.bankTransaction.updateMany.mockResolvedValue({ count: 1 });
    m.db.bankRuleApplication.updateMany.mockResolvedValue({ count: 1 });
  });

  it("devolve a linha às pendentes, apaga a baixa e cancela o lançamento", async () => {
    m.db.bankRuleApplication.findFirst.mockResolvedValue(
      registro({
        status: "PAGO",
        payments: [{ id: "b1", origin: "CONCILIACAO", bankMatch: { id: "v1", transactionId: "t1" } }],
        bankMatches: [{ id: "v1", transactionId: "t1" }],
      })
    );
    await desfazerLancamentoDaRegra(m.db as never, "e1", "a1", "u2");
    expect(m.db.bankTransactionMatch.deleteMany).toHaveBeenCalledWith({ where: { transactionId: "t1", financeEntryId: "conta-1" } });
    expect(m.apagarBaixa).toHaveBeenCalledWith(m.db, "b1", "e1");
    expect(m.db.bankTransaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDENTE" }) }));
    expect(m.db.financeEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "conta-1", tenantId: "e1" }, data: expect.objectContaining({ status: "CANCELADO", closeReason: "CANCELADO" }) })
    );
    expect(m.db.bankRuleApplication.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ undoneById: "u2" }) }));
  });

  it("conciliação já desfeita pela tela: só cancela o lançamento que ficou em aberto", async () => {
    m.db.bankRuleApplication.findFirst.mockResolvedValue(
      registro({ status: "CONFERIDO", payments: [], bankMatches: [] }, { status: "PENDENTE", matches: [] })
    );
    await desfazerLancamentoDaRegra(m.db as never, "e1", "a1", "u2");
    expect(m.apagarBaixa).not.toHaveBeenCalled();
    expect(m.db.bankTransaction.updateMany).not.toHaveBeenCalled();
    expect(m.db.financeEntry.updateMany).toHaveBeenCalled();
  });

  it("alguém pagou o lançamento por outro caminho: recusa, sem mexer em nada", async () => {
    m.db.bankRuleApplication.findFirst.mockResolvedValue(
      registro({ status: "PAGO", payments: [{ id: "b9", origin: "MANUAL", bankMatch: null }], bankMatches: [] }, { status: "PENDENTE", matches: [] })
    );
    await expect(desfazerLancamentoDaRegra(m.db as never, "e1", "a1", "u2")).rejects.toBeInstanceOf(RecusaDoDesfazer);
    expect(m.db.financeEntry.updateMany).not.toHaveBeenCalled();
  });

  it("já desfeito: recusa", async () => {
    m.db.bankRuleApplication.findFirst.mockResolvedValue({ ...registro({ status: "CANCELADO", payments: [], bankMatches: [] }), undoneAt: new Date() });
    await expect(desfazerLancamentoDaRegra(m.db as never, "e1", "a1", "u2")).rejects.toThrow("já foi desfeito");
  });
});
