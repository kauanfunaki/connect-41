import { beforeEach, describe, expect, it, vi } from "vitest";

// O lançamento que nasce da linha do extrato, com o rateio (lote M1 do
// mercado, 23/10/2026): as linhas vão para a conta criada, antes da baixa.

const m = vi.hoisted(() => ({ quitarConta: vi.fn(), gravarRateio: vi.fn() }));
vi.mock("../baixa/servidor", () => ({ quitarConta: m.quitarConta }));
vi.mock("../rateioServidor", () => ({ gravarRateio: m.gravarRateio }));

const { lancarEConciliar } = await import("./lancarDaTransacao");

const tx = {
  financeEntry: { create: vi.fn() },
  bankTransactionMatch: { create: vi.fn() },
  bankTransaction: { updateMany: vi.fn() },
};

const linha = {
  tenantId: "t1",
  companyId: "c1",
  userId: "u1",
  transacao: { id: "tr1", bankAccountId: "b1" },
  dataKey: "2026-10-23",
  kind: "PAGAR" as const,
  centavos: 100000,
  counterpartyId: "cp1",
  categoryId: "aluguel",
  costCenterId: null,
  projectId: null,
  competencia: "2026-10",
  descricao: "Aluguel",
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.financeEntry.create.mockResolvedValue({ id: "e1", amount: "1000.00" });
  tx.bankTransaction.updateMany.mockResolvedValue({ count: 1 });
  m.quitarConta.mockResolvedValue({ paymentId: "p1" });
});

describe("lancarEConciliar", () => {
  it("com rateio, grava as linhas na conta criada antes da baixa", async () => {
    const rateio = [
      { categoriaId: "aluguel", centroId: "lojaA", projetoId: null, centavos: 60000 },
      { categoriaId: "aluguel", centroId: "lojaB", projetoId: null, centavos: 40000 },
    ];
    await lancarEConciliar(tx as never, { ...linha, rateio });
    expect(m.gravarRateio).toHaveBeenCalledWith(tx, { tenantId: "t1", entryId: "e1", linhas: rateio });
    expect(m.gravarRateio.mock.invocationCallOrder[0]!).toBeLessThan(m.quitarConta.mock.invocationCallOrder[0]!);
  });

  it("sem rateio, a conta nasce como antes, sem linhas", async () => {
    await lancarEConciliar(tx as never, linha);
    expect(m.gravarRateio).not.toHaveBeenCalled();
    expect(m.quitarConta).toHaveBeenCalledOnce();
  });
});
