import { beforeEach, describe, expect, it, vi } from "vitest";

// A conta a pagar da nota de compra nasce das duplicatas (23/10, "parado
// #22"): o que `lancarDocumento` grava com duas duplicatas, com uma, com
// duplicatas que não fecham e sem duplicata; que o segundo lançamento não cria
// parcela nenhuma; e que o estorno leva a série inteira — ou não leva nada.

const m = vi.hoisted(() => {
  const tx = {
    financeCounterparty: { create: vi.fn(), update: vi.fn() },
    financeEntry: { create: vi.fn(), createMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    financeRecurrence: { create: vi.fn(), deleteMany: vi.fn() },
    fiscalDocument: { update: vi.fn() },
  };
  const db = {
    financeCounterparty: { findFirst: vi.fn() },
    financeCategory: { findFirst: vi.fn() },
    financeEntry: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return {
    db,
    tx,
    obterDocumento: vi.fn(),
    logAudit: vi.fn(),
    registrarEnvios: vi.fn(),
    avisarAprovadores: vi.fn(),
    statusInicial: vi.fn(() => "NAO_REQUER"),
    cancelarContasDosImpostos: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/auth/context", () => ({
  getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }),
  canActOnSector: () => true,
  canManageSector: () => true,
}));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true, setoresDoModulo: async () => null }));
vi.mock("@/lib/fiscal/data", () => ({ obterDocumento: m.obterDocumento }));
vi.mock("@/lib/financeiro/retencoesServidor", () => ({
  aplicarRetencoes: vi.fn(),
  cancelarContasDosImpostos: m.cancelarContasDosImpostos,
  RecusaDaRetencao: class extends Error {},
}));
vi.mock("@/lib/financeiro/aprovacao/servidor", () => ({
  contextoDeEntrada: async () => ({ statusInicial: m.statusInicial }),
  registrarEnvios: m.registrarEnvios,
  avisarAprovadores: m.avisarAprovadores,
}));
vi.mock("@/lib/financeiro/centroDeCustoServidor", () => ({ centroNaCriacao: async () => ({ ok: true, centroId: null }) }));

import { lancarDocumento, estornarLancamento } from "./lancar";

const dec = (v: string) => ({ toString: () => v });

/** NF-e de compra: a Zahra vende, a BLD (a empresa do escritório) compra. */
function nota(over: Record<string, unknown> = {}) {
  return {
    id: "doc1",
    companyId: "c1",
    company: { id: "c1", kind: "PJ", cnpj: "17122471000175", cpf: null },
    type: "NFE",
    number: "123",
    series: "1",
    issuerName: "ZAHRA",
    issuerDocument: "39952818000140",
    recipientName: "BLD",
    recipientDocument: "17122471000175",
    amount: dec("1000.00"),
    netAmount: null,
    retentionsByTax: null,
    installments: null,
    issuedAt: new Date("2026-09-01T13:30:00Z"),
    competence: "2026-09",
    situation: "AUTORIZADA",
    destination: "PENDENTE",
    removedAtOrigin: false,
    financeEntry: null,
    ...over,
  };
}

const tresDuplicatas = [
  { numero: "002", vencimento: "2026-11-01", valor: "333.33" },
  { numero: "001", vencimento: "2026-10-01", valor: "333.34" },
  { numero: "003", vencimento: "2026-12-01", valor: "333.33" },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.db.financeCounterparty.findFirst.mockResolvedValue({ id: "zahra", defaultCategoryId: "compras", defaultCostCenterId: null });
  m.db.financeCategory.findFirst.mockResolvedValue({ id: "compras" });
  m.tx.financeEntry.create.mockResolvedValue({ id: "e1", amount: dec("333.34") });
  m.statusInicial.mockReturnValue("NAO_REQUER");
});

describe("lancarDocumento — duplicatas da nota", () => {
  it("três duplicatas que fecham: três parcelas, cada uma no vencimento e no valor da sua, competência da compra", async () => {
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas }));
    const r = await lancarDocumento("doc1", { vencimento: "2027-01-31" });
    expect(r).toEqual({ ok: true, entryId: "e1" });

    const primeira = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(primeira).toMatchObject({
      amount: "333.34",
      competence: "2026-09",
      fiscalDocumentId: "doc1",
      recurrenceIndex: 1,
      recurrenceTotal: 3,
      status: "PROVISORIO",
    });
    // O vencimento do formulário não vale na parcelada: o da 1ª duplicata.
    expect(primeira.dueDate.toISOString().slice(0, 10)).toBe("2026-10-01");

    const outras = m.tx.financeEntry.createMany.mock.calls[0]![0].data;
    expect(outras.map((o: { amount: string }) => o.amount)).toEqual(["333.33", "333.33"]);
    expect(outras.map((o: { dueDate: Date }) => o.dueDate.toISOString().slice(0, 10))).toEqual(["2026-11-01", "2026-12-01"]);
    expect(outras.map((o: { recurrenceIndex: number }) => o.recurrenceIndex)).toEqual([2, 3]);
    for (const o of outras) {
      expect(o).toMatchObject({ competence: "2026-09", recurrenceId: primeira.recurrenceId, recurrenceTotal: 3, documentNumber: "123/1" });
      // O vínculo com a nota é 1:1 — fica só na primeira.
      expect(o.fiscalDocumentId).toBeUndefined();
    }
    expect(m.tx.financeRecurrence.create.mock.calls[0]![0].data).toMatchObject({
      id: primeira.recurrenceId,
      endMode: "VEZES",
      dayAdjust: "MANTER",
      total: 3,
      lastIndex: 3,
      firstDueDate: "2026-10-01",
      firstCompetence: "2026-09",
    });
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas).toMatchObject({ parcelas: 3, serie: primeira.recurrenceId, total: "1000.00" });
  });

  it("com alçada: todas as parcelas entram aguardando, e cada uma avisa com o seu valor", async () => {
    m.statusInicial.mockReturnValue("AGUARDANDO");
    m.avisarAprovadores.mockResolvedValue({ enviados: 1, semSmtp: false });
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas }));
    await lancarDocumento("doc1", {});
    expect(m.registrarEnvios).toHaveBeenCalledTimes(2);
    expect(m.registrarEnvios.mock.calls[1]![1]).toHaveLength(2);
    expect(m.avisarAprovadores.mock.calls[0]![1].map((a: { amount: { toString(): string } }) => a.amount.toString())).toEqual([
      "333.34",
      "333.33",
      "333.33",
    ]);
  });

  it("duplicatas que não fecham: a conta de sempre, inteira, e o motivo na auditoria", async () => {
    m.obterDocumento.mockResolvedValue(nota({ installments: [tresDuplicatas[0], tresDuplicatas[1]] }));
    await lancarDocumento("doc1", { vencimento: "2026-10-01" });
    expect(String(m.tx.financeEntry.create.mock.calls[0]![0].data.amount)).toBe("1000.00");
    expect(m.tx.financeEntry.create.mock.calls[0]![0].data.recurrenceId).toBeUndefined();
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
    expect(m.tx.financeRecurrence.create).not.toHaveBeenCalled();
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas.recusadas).toMatch(/somam/);
  });

  it("uma duplicata: uma conta, vencendo nela quando o formulário não diz", async () => {
    m.obterDocumento.mockResolvedValue(nota({ installments: [{ numero: "1", vencimento: "2026-09-21", valor: "1000.00" }] }));
    await lancarDocumento("doc1", {});
    const conta = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(conta.dueDate.toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(conta.recurrenceId).toBeUndefined();
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
  });

  it("sem duplicatas: o comportamento de antes — vencimento presumido, nada de série", async () => {
    m.obterDocumento.mockResolvedValue(nota());
    await lancarDocumento("doc1", {});
    const conta = m.tx.financeEntry.create.mock.calls[0]![0].data;
    expect(conta.dueDate.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(conta.recurrenceId).toBeUndefined();
    expect(m.logAudit.mock.calls[0]![0].metadata.duplicatas).toBeUndefined();
  });

  it("já lançada: recusa antes de gravar qualquer parcela", async () => {
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas, destination: "LANCADO", financeEntry: { id: "e1" } }));
    const r = await lancarDocumento("doc1", {});
    expect(r).toHaveProperty("error");
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("dois cliques ao mesmo tempo: o unique barra a 1ª parcela, e as outras não nascem", async () => {
    m.obterDocumento.mockResolvedValue(nota({ installments: tresDuplicatas }));
    m.tx.financeEntry.create.mockRejectedValueOnce(new Error("Unique constraint failed on fiscalDocumentId"));
    const r = await lancarDocumento("doc1", {});
    expect(r).toEqual({ error: "Este documento já virou lançamento." });
    expect(m.tx.financeEntry.createMany).not.toHaveBeenCalled();
    expect(m.tx.financeRecurrence.create).not.toHaveBeenCalled();
  });
});

describe("estornarLancamento — conta parcelada pela nota", () => {
  const lancada = (over: Record<string, unknown> = {}) =>
    nota({
      destination: "LANCADO",
      financeEntry: { id: "e1", status: "PROVISORIO", closeReason: null, recurrenceId: "s1", recurrenceTotal: 3, ...over },
    });
  const parcela = (id: string, i: number, over: Record<string, unknown> = {}) => ({
    id,
    status: "PROVISORIO",
    paidPrincipal: dec("0"),
    closeReason: null,
    agreementId: null,
    recurrenceIndex: i,
    ...over,
  });

  it("leva as parcelas e a série juntas", async () => {
    m.obterDocumento.mockResolvedValue(lancada());
    m.db.financeEntry.findMany.mockResolvedValue([parcela("e2", 2), parcela("e3", 3)]);
    m.tx.financeEntry.deleteMany.mockResolvedValue({ count: 2 });
    expect(await estornarLancamento("doc1")).toEqual({ ok: true });
    expect(m.cancelarContasDosImpostos.mock.calls[0]![2]).toEqual(["e1", "e2", "e3"]);
    expect(m.tx.financeEntry.deleteMany.mock.calls[0]![0].where.id).toEqual({ in: ["e2", "e3"] });
    expect(m.tx.financeEntry.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
    expect(m.tx.financeRecurrence.deleteMany).toHaveBeenCalledWith({ where: { id: "s1", tenantId: "t1" } });
    expect(m.tx.fiscalDocument.update).toHaveBeenCalledWith({ where: { id: "doc1" }, data: { destination: "PENDENTE" } });
  });

  it("uma parcela com baixa barra o estorno inteiro — nada é apagado", async () => {
    m.obterDocumento.mockResolvedValue(lancada());
    m.db.financeEntry.findMany.mockResolvedValue([parcela("e2", 2, { paidPrincipal: dec("100.00") }), parcela("e3", 3)]);
    const r = await estornarLancamento("doc1");
    expect(r).toEqual({ error: expect.stringMatching(/parcela 2/) });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("a baixa que chegou entre a leitura e o estorno: a transação desfaz tudo", async () => {
    m.obterDocumento.mockResolvedValue(lancada());
    m.db.financeEntry.findMany.mockResolvedValue([parcela("e2", 2), parcela("e3", 3)]);
    m.tx.financeEntry.deleteMany.mockResolvedValue({ count: 1 });
    const r = await estornarLancamento("doc1");
    expect(r).toEqual({ error: expect.stringMatching(/acabou de mudar/) });
    expect(m.tx.financeEntry.delete).not.toHaveBeenCalled();
  });

  it("conta sem série: o estorno de sempre", async () => {
    m.obterDocumento.mockResolvedValue(lancada({ recurrenceId: null, recurrenceTotal: null }));
    expect(await estornarLancamento("doc1")).toEqual({ ok: true });
    expect(m.db.financeEntry.findMany).not.toHaveBeenCalled();
    expect(m.tx.financeEntry.deleteMany).not.toHaveBeenCalled();
    expect(m.tx.financeRecurrence.deleteMany).not.toHaveBeenCalled();
  });
});
