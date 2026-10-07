import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa (07/10): os totais das contas do portal são somados no
// banco, sobre o escopo inteiro — e não sobre as 500 linhas que a lista traz —,
// com as mesmas regras de `situacaoDaConta`/`totalizar`.
const aggregate = vi.fn();
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ financeEntry: { aggregate } }) }));

const { totaisDoEscopo } = await import("./consultas");

const escopo = { tenantId: "t1", companyIds: ["c1", "c2"] };
const decimal = (s: string) => ({ toString: () => s });

beforeEach(() => vi.clearAllMocks());

describe("totaisDoEscopo", () => {
  it("soma cada situação no banco e monta o em aberto", async () => {
    aggregate
      .mockResolvedValueOnce({ _sum: { amount: decimal("10483.00") }, _min: { paidAt: new Date("2025-03-10T15:00:00Z") } })
      .mockResolvedValueOnce({ _sum: { amount: decimal("9790.10") } })
      .mockResolvedValueOnce({ _sum: { amount: null } })
      .mockResolvedValueOnce({ _sum: { amount: decimal("21686.00") } });

    const t = await totaisDoEscopo(escopo, "PAGAR", "2026-10-07");

    expect(t).toEqual({
      pago: 1_048_300,
      vencido: 979_010,
      venceHoje: 0,
      aVencer: 2_168_600,
      emAberto: 979_010 + 2_168_600,
      pagoDesde: new Date("2025-03-10T15:00:00Z"),
    });
  });

  it("usa o escopo do cliente, sem teto, e o corte de hoje em São Paulo", async () => {
    aggregate.mockResolvedValue({ _sum: { amount: null }, _min: { paidAt: null } });
    await totaisDoEscopo(escopo, "RECEBER", "2026-10-07");

    const [pagas, vencidas, deHoje, aVencer] = aggregate.mock.calls.map((c) => c[0]);
    const doEscopo = { tenantId: "t1", companyId: { in: ["c1", "c2"] }, kind: "RECEBER" };
    const hoje = new Date("2026-10-07T00:00:00-03:00");
    const amanha = new Date("2026-10-08T00:00:00-03:00");

    // Paga: status PAGO ou com baixa, nunca cancelada.
    expect(pagas.where).toEqual({ ...doEscopo, status: { not: "CANCELADO" }, OR: [{ status: "PAGO" }, { paidAt: { not: null } }] });
    // Em aberto: nem paga nem cancelada, dividida pelo vencimento.
    const emAberto = { ...doEscopo, paidAt: null, status: { notIn: ["CANCELADO", "PAGO"] } };
    expect(vencidas.where).toEqual({ ...emAberto, dueDate: { lt: hoje } });
    expect(deHoje.where).toEqual({ ...emAberto, dueDate: { gte: hoje, lt: amanha } });
    expect(aVencer.where).toEqual({ ...emAberto, dueDate: { gte: amanha } });
    for (const chamada of aggregate.mock.calls) expect(chamada[0]).not.toHaveProperty("take");
  });

  it("escopo sem empresa não vira o escritório inteiro", async () => {
    aggregate.mockResolvedValue({ _sum: { amount: null }, _min: { paidAt: null } });
    await totaisDoEscopo({ tenantId: "t1", companyIds: [] }, "PAGAR", "2026-10-07");
    for (const chamada of aggregate.mock.calls) expect(chamada[0].where.companyId).toEqual({ in: [] });
  });
});
