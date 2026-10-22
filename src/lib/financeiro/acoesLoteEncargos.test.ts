import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// Juros e multa na baixa em lote (22/10/2026): com a opção ligada, o servidor
// calcula conta a conta pela regra lida no banco (a da ficha passa por cima da
// da empresa), sobre o saldo relido com a conta travada — o formulário não
// manda valor de encargo. Desligada, o lote quita pelo saldo, como antes. A
// conta presa ao Omie continua de fora.

type Colunas = { lateFinePercent: string | null; lateInterestPercent: string | null; earlyDiscountPercent: string | null };
const nula: Colunas = { lateFinePercent: null, lateInterestPercent: null, earlyDiscountPercent: null };

const estado = vi.hoisted(() => ({
  ctx: null as unknown as AuthContext,
  linhas: [] as Record<string, unknown>[],
  /** O saldo "relido com a conta travada", por conta. */
  saldoTravado: {} as Record<string, number>,
  quitadas: [] as { entryId: string; jurosCentavos?: number; multaCentavos?: number; descontoCentavos?: number; principalCentavos: number }[],
  auditorias: [] as { entityId: string; metadata: Record<string, unknown> }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/context", async (original) => ({
  ...(await original<typeof import("@/lib/auth/context")>()),
  getAuthContext: async () => estado.ctx,
}));
vi.mock("@/lib/modules", () => ({ setoresDoModulo: async () => ["bpo"] }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => null, empresasDasContas: async () => [] }));
vi.mock("./cobranca/sincronizar", () => ({ sincronizarAcordos: async () => {} }));
vi.mock("@/lib/audit", () => ({
  logAudit: async (a: { entityId: string; metadata: Record<string, unknown> }) => {
    estado.auditorias.push({ entityId: a.entityId, metadata: a.metadata });
  },
}));
vi.mock("./baixa/servidor", async (original) => ({
  ...(await original<typeof import("./baixa/servidor")>()),
  quitarConta: async (
    _tx: unknown,
    b: { entryId: string },
    encargosPeloSaldo?: (saldo: number) => { jurosCentavos?: number; multaCentavos?: number; descontoCentavos?: number }
  ) => {
    const saldo = estado.saldoTravado[b.entryId]!;
    const e = encargosPeloSaldo ? encargosPeloSaldo(saldo) : {};
    estado.quitadas.push({ entryId: b.entryId, principalCentavos: saldo, ...e });
    const caixa = saldo + (e.jurosCentavos ?? 0) + (e.multaCentavos ?? 0) - (e.descontoCentavos ?? 0);
    return { paymentId: `p-${b.entryId}`, quitada: true, caixaCentavos: caixa, principal: { toString: () => (saldo / 100).toFixed(2) } };
  },
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    financeEntry: { findMany: async () => estado.linhas },
    bankAccount: { findFirst: async () => null, findMany: async () => [] },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({}),
  }),
}));

import { dadosDaBaixaEmLote, registrarPagamentosEmLote } from "./acoes";

const empresaComRegra: Colunas = { lateFinePercent: "2.0000", lateInterestPercent: "1.0000", earlyDiscountPercent: null };

function linha(id: string, o: { empresa?: Colunas; contraparte?: Colunas; vencimento?: string; extra?: Record<string, unknown> } = {}) {
  return {
    id,
    kind: "PAGAR",
    status: "CONFERIDO",
    amount: "1000.00",
    paidPrincipal: "0.00",
    approvalStatus: "NAO_REQUER",
    dueDate: new Date(`${o.vencimento ?? "2026-09-22"}T15:00:00Z`),
    companyId: "c1",
    omieTitleId: null,
    omieMovementId: null,
    transferId: null,
    cardAccountId: null,
    company: { name: "Padaria", displayName: null, omieCutoverAt: null, ...(o.empresa ?? empresaComRegra) },
    counterparty: { name: `Fornecedor ${id}`, ...(o.contraparte ?? nula) },
    ...o.extra,
  };
}

function formulario(ids: string[], encargos: boolean) {
  const f = new FormData();
  for (const id of ids) f.append("entryIds", id);
  f.set("data", "2026-10-22");
  if (encargos) f.set("encargos", "1");
  // Um total forjado não muda nada: o servidor não lê valor de encargo.
  f.set("juros", "999,99");
  return f;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T15:00:00Z"));
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
  estado.quitadas = [];
  estado.auditorias = [];
  estado.saldoTravado = {};
});

describe("baixa em lote com juros e multa", () => {
  it("a janela recebe a regra de cada conta (a da ficha por cima da empresa; transferência sem regra)", async () => {
    estado.linhas = [
      linha("a"),
      linha("b", { contraparte: { ...nula, lateInterestPercent: "3.0000" } }),
      linha("c", { extra: { transferId: "tr1" } }),
      linha("d", { empresa: nula }),
    ];
    const d = await dadosDaBaixaEmLote(["a", "b", "c", "d"]);
    if (!d.ok) throw new Error(d.erro);
    const regra = Object.fromEntries(d.entram.map((c) => [c.id, c.regraDeEncargos]));
    expect(regra.a).toMatchObject({ multa: 20_000, jurosAoMes: 10_000, origem: "empresa" });
    expect(regra.b).toMatchObject({ multa: 0, jurosAoMes: 30_000, origem: "contraparte" });
    expect(regra.c).toBeNull();
    expect(regra.d).toBeNull();
  });

  it("ligada: cada conta pela sua regra, sobre o saldo relido — não pelo que a tela mandou", async () => {
    estado.linhas = [linha("a"), linha("b", { contraparte: { ...nula, lateInterestPercent: "3.0000" } }), linha("d", { empresa: nula })];
    // "a" foi paga em parte depois que a janela abriu: o saldo travado é 600,00.
    estado.saldoTravado = { a: 60_000, b: 100_000, d: 100_000 };
    const r = await registrarPagamentosEmLote(formulario(["a", "b", "d"], true));
    expect(r).toMatchObject({ ok: true, baixadas: 3, recusadas: [] });
    const por = Object.fromEntries(estado.quitadas.map((q) => [q.entryId, q]));
    // 30 dias de atraso: multa 2% + juros 1% a.m. sobre 600,00.
    expect(por.a).toMatchObject({ principalCentavos: 60_000, multaCentavos: 1_200, jurosCentavos: 600, descontoCentavos: 0 });
    // A da ficha: só juros de 3% a.m. sobre 1.000,00.
    expect(por.b).toMatchObject({ multaCentavos: 0, jurosCentavos: 3_000 });
    // Sem regra: pelo saldo.
    expect(por.d!.jurosCentavos).toBeUndefined();
    expect(r).toMatchObject({ totalCentavos: 60_000 + 1_800 + 103_000 + 100_000 });
    const auditA = estado.auditorias.find((a) => a.entityId === "a")!.metadata;
    expect(auditA).toMatchObject({ valor: "600.00", juros: "6.00", multa: "12.00", total: "618.00", encargosPelaRegra: "empresa", emLote: true });
  });

  it("desligada: quita pelo saldo, sem encargos", async () => {
    estado.linhas = [linha("a")];
    estado.saldoTravado = { a: 100_000 };
    const r = await registrarPagamentosEmLote(formulario(["a"], false));
    expect(r).toMatchObject({ ok: true, baixadas: 1, totalCentavos: 100_000 });
    expect(estado.quitadas[0]!.jurosCentavos).toBeUndefined();
    expect(estado.auditorias[0]!.metadata).not.toHaveProperty("juros");
  });

  it("a conta presa ao Omie continua de fora", async () => {
    estado.linhas = [
      linha("a"),
      linha("omie", { extra: { omieTitleId: "123", company: { name: "Padaria", displayName: null, omieCutoverAt: null, ...empresaComRegra } } }),
    ];
    estado.saldoTravado = { a: 100_000 };
    const r = await registrarPagamentosEmLote(formulario(["a", "omie"], true));
    if (!("ok" in r)) throw new Error(r.error);
    expect(r.baixadas).toBe(1);
    expect(r.recusadas.map((f) => f.id)).toEqual(["omie"]);
    expect(estado.quitadas.map((q) => q.entryId)).toEqual(["a"]);
  });
});
