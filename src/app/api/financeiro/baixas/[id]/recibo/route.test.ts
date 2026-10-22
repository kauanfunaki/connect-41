import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { AuthContext } from "@/lib/auth/context";

// A rota do recibo da baixa (22/10/2026), de ponta a ponta: sessão, módulos,
// foco e banco simulados; a régua de quem vê a conta (`podeVerOTipo`) é a
// real. O banco simulado respeita o `where` da rota — baixa de outro
// escritório não é achada.

type Baixa = { id: string; tenantId: string; companyId: string; kind: "PAGAR" | "RECEBER" };

const estado = vi.hoisted(() => ({
  ctx: null as unknown as AuthContext,
  ligados: new Set<string>(),
  baixas: [] as Baixa[],
  foraDoFoco: null as string | null,
}));

vi.mock("@/lib/auth/context", async (original) => ({
  ...(await original<typeof import("@/lib/auth/context")>()),
  getAuthContext: async () => estado.ctx,
}));
vi.mock("@/lib/modules", () => ({
  isModuleEnabled: async (_t: string, codigo: string) => estado.ligados.has(codigo),
  setoresDoModulo: async () => ["bpo"],
}));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => estado.foraDoFoco }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    financeEntryPayment: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
        const b = estado.baixas.find((x) => x.id === where.id && x.tenantId === where.tenantId);
        if (!b) return null;
        return {
          id: b.id,
          companyId: b.companyId,
          paidAt: new Date("2026-10-20T15:00:00Z"),
          principal: "1000.00",
          interest: "3.33",
          fine: "20.00",
          discount: "0.00",
          cash: "1023.33",
          note: null,
          origin: "MANUAL",
          createdAt: new Date("2026-10-20T15:00:00Z"),
          tenant: { name: "41 Contábil" },
          company: { name: "Padaria", displayName: null, kind: "PESSOA_JURIDICA", cnpj: "12345678000190", cpf: null },
          bankAccount: { nickname: "Itaú", accountNumber: "12345-6", type: "CORRENTE" },
          createdBy: { name: "Ana" },
          entry: {
            kind: b.kind,
            amount: "1000.00",
            dueDate: new Date("2026-10-10T15:00:00Z"),
            description: "Farinha",
            documentNumber: null,
            counterparty: { name: "Moinho", document: "98765432000110" },
          },
        };
      },
    },
  }),
}));

import { GET } from "./route";

function ctx(role: AuthContext["role"], sectors: string[], extra: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
    ...extra,
  };
}

async function baixar(quem: AuthContext, id: string) {
  estado.ctx = quem;
  return GET(new Request(`http://localhost/api/financeiro/baixas/${id}/recibo`) as unknown as NextRequest, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  estado.ligados = new Set(["bpo_contas_pagar", "bpo_contas_receber", "bpo_lancamentos"]);
  estado.foraDoFoco = null;
  estado.baixas = [
    { id: "b-pagar", tenantId: "t1", companyId: "c1", kind: "PAGAR" },
    { id: "b-receber", tenantId: "t1", companyId: "c1", kind: "RECEBER" },
    { id: "b-fora", tenantId: "t2", companyId: "c9", kind: "PAGAR" },
  ];
});

describe("recibo da baixa em PDF", () => {
  it("quem é do BPO baixa o PDF, como anexo com o número do recibo", async () => {
    const r = await baixar(ctx("SECTOR_USER", ["bpo"]), "b-pagar");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toContain("recibo-");
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("sem sessão: 401", async () => {
    expect((await baixar(ctx("SECTOR_USER", ["bpo"], { userId: null as unknown as string }), "b-pagar")).status).toBe(401);
  });

  it("baixa de outro escritório ou inexistente: 404", async () => {
    expect((await baixar(ctx("ADMIN", []), "b-fora")).status).toBe(404);
    expect((await baixar(ctx("ADMIN", []), "nao-existe")).status).toBe(404);
  });

  it("quem não vê o setor do BPO: 403", async () => {
    expect((await baixar(ctx("SECTOR_USER", ["dp"]), "b-receber")).status).toBe(403);
  });

  it("com os módulos do tipo e de Lançamentos desligados: 403", async () => {
    estado.ligados = new Set(["bpo_contas_receber"]);
    expect((await baixar(ctx("SECTOR_USER", ["bpo"]), "b-pagar")).status).toBe(403);
    expect((await baixar(ctx("SECTOR_USER", ["bpo"]), "b-receber")).status).toBe(200);
  });

  it("com outra empresa em foco: 403, com o motivo", async () => {
    estado.foraDoFoco = "Fora da empresa em foco.";
    const r = await baixar(ctx("SECTOR_USER", ["bpo"]), "b-pagar");
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "Fora da empresa em foco." });
  });
});
