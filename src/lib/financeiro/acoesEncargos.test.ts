import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// A janela da baixa recebe o vencimento e a regra de juros e multa que vale
// para a conta (22/10/2026): a do fornecedor ou cliente, senão a da empresa.
// A transferência e a fatura do cartão não têm atraso a cobrar.

type Colunas = { lateFinePercent: string | null; lateInterestPercent: string | null; earlyDiscountPercent: string | null };
const nula: Colunas = { lateFinePercent: null, lateInterestPercent: null, earlyDiscountPercent: null };

const estado = vi.hoisted(() => ({
  ctx: null as unknown as AuthContext,
  conta: null as null | Record<string, unknown>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/context", async (original) => ({
  ...(await original<typeof import("@/lib/auth/context")>()),
  getAuthContext: async () => estado.ctx,
}));
vi.mock("@/lib/modules", () => ({ setoresDoModulo: async () => ["bpo"] }));
vi.mock("./cartaoServidor", () => ({ cartoesParaABaixa: async () => [] }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    financeEntry: { findFirst: async () => estado.conta },
    bankAccount: { findMany: async () => [], findFirst: async () => null },
  }),
}));

import { dadosDaBaixa } from "./acoes";

function conta(empresa: Colunas, contraparte: Colunas, extra: Record<string, unknown> = {}) {
  return {
    kind: "PAGAR",
    status: "CONFERIDO",
    amount: "1000.00",
    paidPrincipal: "0.00",
    approvalStatus: "NAO_REQUER",
    companyId: "c1",
    bankAccountId: null,
    counterpartyId: "cp1",
    cardAccountId: null,
    transferId: null,
    dueDate: new Date("2026-10-10T15:00:00Z"),
    counterparty: { name: "Moinho", ...contraparte },
    company: empresa,
    payments: [],
    ...extra,
  };
}

beforeEach(() => {
  estado.ctx = {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role: "SECTOR_USER",
    sectors: ["bpo"],
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
  };
});

describe("dados da baixa com juros e multa", () => {
  it("sem regra: nula — a janela fica como antes", async () => {
    estado.conta = conta(nula, nula);
    const d = await dadosDaBaixa("e1");
    expect(d).toMatchObject({ ok: true, vencimentoKey: "2026-10-10", regraDeEncargos: null });
  });

  it("a da empresa, quando a ficha não tem", async () => {
    estado.conta = conta({ lateFinePercent: "2.0000", lateInterestPercent: "1.0000", earlyDiscountPercent: null }, nula);
    expect(await dadosDaBaixa("e1")).toMatchObject({ regraDeEncargos: { multa: 20_000, jurosAoMes: 10_000, desconto: 0, origem: "empresa" } });
  });

  it("a da ficha passa por cima da empresa", async () => {
    estado.conta = conta({ lateFinePercent: "2.0000", lateInterestPercent: "1.0000", earlyDiscountPercent: null }, { ...nula, lateInterestPercent: "3.0000" });
    expect(await dadosDaBaixa("e1")).toMatchObject({ regraDeEncargos: { multa: 0, jurosAoMes: 30_000, desconto: 0, origem: "contraparte" } });
  });

  it("transferência e fatura do cartão: sem regra", async () => {
    const empresa = { lateFinePercent: "2.0000", lateInterestPercent: "1.0000", earlyDiscountPercent: null };
    estado.conta = conta(empresa, nula, { transferId: "tr1" });
    expect(await dadosDaBaixa("e1")).toMatchObject({ regraDeEncargos: null });
    estado.conta = conta(empresa, nula, { cardAccountId: "cartao" });
    expect(await dadosDaBaixa("e1")).toMatchObject({ regraDeEncargos: null });
  });
});
