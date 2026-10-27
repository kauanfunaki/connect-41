import { beforeEach, describe, expect, it, vi } from "vitest";

// A conferência pela nota inteira (23/10/2026, 1:N): conferir uma parcela que
// nasceu das duplicatas confere as outras provisórias da mesma nota; a já
// paga fica como está; conta sem nota é só ela.

type Linha = { id: string; tenantId: string; companyId: string; status: string; fiscalDocumentId: string | null; reviewedAt?: Date | null };

const estado = vi.hoisted(() => ({ linhas: [] as Linha[], auditorias: [] as { entityId: string; metadata: Record<string, unknown> }[] }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/context", async (original) => ({
  ...(await original<typeof import("@/lib/auth/context")>()),
  getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }),
  canActOnSector: () => true,
}));
vi.mock("@/lib/modules", () => ({ setoresDoModulo: async () => ["bpo"] }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => null, empresasDasContas: () => async () => [] }));
vi.mock("./cobranca/sincronizar", () => ({ sincronizarAcordos: async () => {} }));
vi.mock("@/lib/audit", () => ({
  logAudit: async (a: { entityId: string; metadata: Record<string, unknown> }) => {
    estado.auditorias.push({ entityId: a.entityId, metadata: a.metadata });
  },
}));

type Where = { id?: string | { in: string[] }; tenantId?: string; status?: string; fiscalDocumentId?: { not: null } | { in: string[] }; reviewedAt?: Date };
function casa(l: Linha, w: Where) {
  if (typeof w.id === "string" && l.id !== w.id) return false;
  if (w.id && typeof w.id === "object" && !w.id.in.includes(l.id)) return false;
  if (w.tenantId && l.tenantId !== w.tenantId) return false;
  if (w.status && l.status !== w.status) return false;
  if (w.fiscalDocumentId && "not" in w.fiscalDocumentId && l.fiscalDocumentId === null) return false;
  if (w.fiscalDocumentId && "in" in w.fiscalDocumentId && !w.fiscalDocumentId.in.includes(l.fiscalDocumentId ?? "")) return false;
  if (w.reviewedAt && l.reviewedAt?.getTime() !== w.reviewedAt.getTime()) return false;
  return true;
}
const comoLinha = (l: Linha) => ({ ...l, kind: "PAGAR", paidAt: null, amount: "1", approvalStatus: "NAO_REQUER", counterparty: { name: "Zahra" } });

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    financeEntry: {
      findFirst: async ({ where }: { where: Where }) => {
        const l = estado.linhas.find((x) => casa(x, where));
        return l ? comoLinha(l) : null;
      },
      findMany: async ({ where }: { where: Where }) => estado.linhas.filter((x) => casa(x, where)).map(comoLinha),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Linha> }) => {
        Object.assign(estado.linhas.find((x) => x.id === where.id)!, data);
      },
      updateMany: async ({ where, data }: { where: Where; data: Partial<Linha> }) => {
        const alvo = estado.linhas.filter((x) => casa(x, where));
        for (const l of alvo) Object.assign(l, data);
        return { count: alvo.length };
      },
    },
  }),
}));

import { conferirConta, conferirContasEmLote } from "./acoes";

const status = () => Object.fromEntries(estado.linhas.map((l) => [l.id, l.status]));

beforeEach(() => {
  estado.auditorias = [];
  estado.linhas = [
    { id: "e1", tenantId: "t1", companyId: "c1", status: "PROVISORIO", fiscalDocumentId: "doc1" },
    { id: "e2", tenantId: "t1", companyId: "c1", status: "PROVISORIO", fiscalDocumentId: "doc1" },
    { id: "e3", tenantId: "t1", companyId: "c1", status: "PAGO", fiscalDocumentId: "doc1" },
    { id: "outra-nota", tenantId: "t1", companyId: "c1", status: "PROVISORIO", fiscalDocumentId: "doc2" },
    { id: "manual", tenantId: "t1", companyId: "c1", status: "PROVISORIO", fiscalDocumentId: null },
    { id: "outro-tenant", tenantId: "t2", companyId: "c9", status: "PROVISORIO", fiscalDocumentId: "doc1" },
  ];
});

describe("conferirConta — parcela de nota", () => {
  it("confere as outras provisórias da mesma nota; a paga, a de outra nota e a de outro tenant ficam", async () => {
    expect(await conferirConta("e2")).toBeNull();
    expect(status()).toEqual({
      e1: "CONFERIDO",
      e2: "CONFERIDO",
      e3: "PAGO",
      "outra-nota": "PROVISORIO",
      manual: "PROVISORIO",
      "outro-tenant": "PROVISORIO",
    });
    expect(estado.auditorias[0]!.metadata).toMatchObject({ fiscalDocumentId: "doc1", parcelasDaNota: 2 });
  });

  it("conta sem nota: só ela", async () => {
    expect(await conferirConta("manual")).toBeNull();
    expect(status()).toMatchObject({ manual: "CONFERIDO", e1: "PROVISORIO", e2: "PROVISORIO" });
    expect(estado.auditorias[0]!.metadata).toEqual({ contraparte: "Zahra" });
  });
});

describe("conferirContasEmLote — parcela de nota", () => {
  it("marcar uma parcela leva as da mesma nota; as puladas contam só as marcadas", async () => {
    const r = await conferirContasEmLote(["e1", "manual"]);
    expect(r).toEqual({ ok: true, conferidas: 3, puladas: 0 });
    expect(status()).toMatchObject({ e1: "CONFERIDO", e2: "CONFERIDO", e3: "PAGO", manual: "CONFERIDO", "outra-nota": "PROVISORIO" });
  });
});
