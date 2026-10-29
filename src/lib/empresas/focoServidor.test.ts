import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// A trava no servidor (21/10/2026): com uma empresa em foco, a action que
// grava em outra empresa é recusada — a BLD (matriz e 21 filiais) e uma
// empresa sem filial. O cookie e o banco são de mentira; a regra é a de verdade.

type Empresa = { id: string; tenantId: string; name: string; status: string; parentCompanyId: string | null };
let EMPRESAS: Empresa[] = [];
let CONTAS: { id: string; tenantId: string; companyId: string }[] = [];
let COOKIE: string | undefined;

const company = {
  findFirst: vi.fn(async ({ where }: { where: { tenantId: string; id: string } }) => {
    const e = EMPRESAS.find((x) => x.id === where.id && x.tenantId === where.tenantId);
    return e ? { ...e, displayName: null, logoUrl: null } : null;
  }),
  findMany: vi.fn(async ({ where }: { where: { tenantId: string; OR: [{ id: string }, { parentCompanyId: string }] } }) => {
    const matriz = where.OR[0].id;
    return EMPRESAS.filter((e) => e.tenantId === where.tenantId && (e.id === matriz || e.parentCompanyId === matriz)).map((e) => ({ id: e.id }));
  }),
};
const financeEntry = {
  findMany: vi.fn(async ({ where }: { where: { tenantId: string; id: { in: string[] } } }) =>
    CONTAS.filter((c) => c.tenantId === where.tenantId && where.id.in.includes(c.id)).map((c) => ({ companyId: c.companyId }))
  ),
};
// A chave do setor (29/10/2026): sem linha, ligada.
let CHAVES: { code: string; companyFocus: boolean | null }[] = [];
const sector = {
  findMany: vi.fn(async ({ where }: { where: { code: { in: string[] } } }) => CHAVES.filter((c) => where.code.in.includes(c.code))),
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ company, financeEntry, sector }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (COOKIE ? { value: COOKIE } : undefined) }) }));
vi.mock("@/lib/modules", () => ({ getTenantModuleStates: async () => [{ code: "bpo_contas_pagar", enabled: true, sectorCode: "bpo" }] }));
vi.mock("@/lib/auth/cookies", () => ({ sessionCookieDomain: () => undefined }));

const { recusaDoFoco, empresasDasContas, lerEmpresaEmFoco, leituraNoFoco, podeUsarOFoco } = await import("./focoServidor");

function ctx(parcial: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role: "SECTOR_USER",
    sectors: ["bpo"],
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: false,
    activeSector: null,
    ...parcial,
  };
}

const emFoco = (companyId: string) => {
  COOKIE = `t1.u1.${companyId}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  COOKIE = undefined;
  CHAVES = [];
  EMPRESAS = [
    { id: "bld", tenantId: "t1", name: "BLD", status: "ACTIVE", parentCompanyId: null },
    ...Array.from({ length: 21 }, (_, i) => ({ id: `bld-f${i + 1}`, tenantId: "t1", name: `BLD ${i + 1}`, status: "ACTIVE", parentCompanyId: "bld" })),
    { id: "padaria", tenantId: "t1", name: "Padaria do Zé", status: "ACTIVE", parentCompanyId: null },
    { id: "encerrada", tenantId: "t1", name: "Encerrada", status: "CHURNED", parentCompanyId: null },
    { id: "de-outro", tenantId: "t2", name: "De outro escritório", status: "ACTIVE", parentCompanyId: null },
  ];
  CONTAS = [
    { id: "conta-bld-f7", tenantId: "t1", companyId: "bld-f7" },
    { id: "conta-padaria", tenantId: "t1", companyId: "padaria" },
  ];
});

describe("lerEmpresaEmFoco", () => {
  it("sem o cookie, nem consulta o banco", async () => {
    expect(await lerEmpresaEmFoco(ctx())).toBeNull();
    expect(company.findFirst).not.toHaveBeenCalled();
  });

  it("a filial em foco traz a matriz e as 21 filiais", async () => {
    emFoco("bld-f3");
    const foco = await lerEmpresaEmFoco(ctx());
    expect(foco).toMatchObject({ companyId: "bld-f3", matrizId: "bld" });
    expect(foco!.grupo).toHaveLength(22);
    expect(foco!.grupo).toContain("bld");
  });

  it("a empresa sem filial é o próprio grupo", async () => {
    emFoco("padaria");
    expect((await lerEmpresaEmFoco(ctx()))!.grupo).toEqual(["padaria"]);
  });

  it("empresa encerrada, de outro escritório ou cookie de outra pessoa: sem foco", async () => {
    emFoco("encerrada");
    expect(await lerEmpresaEmFoco(ctx())).toBeNull();
    emFoco("de-outro");
    expect(await lerEmpresaEmFoco(ctx())).toBeNull();
    emFoco("bld");
    expect(await lerEmpresaEmFoco(ctx({ userId: "u2" }))).toBeNull();
  });
});

describe("recusaDoFoco — a trava das actions", () => {
  it("sem foco, grava — e a consulta das empresas nem roda", async () => {
    const carregar = vi.fn(async () => ["padaria"]);
    expect(await recusaDoFoco(ctx(), carregar)).toBeNull();
    expect(carregar).not.toHaveBeenCalled();
  });

  it("foco na BLD: grava na matriz e nas filiais", async () => {
    emFoco("bld");
    expect(await recusaDoFoco(ctx(), ["bld", "bld-f21"])).toBeNull();
    expect(await recusaDoFoco(ctx(), empresasDasContas("t1", ["conta-bld-f7"]))).toBeNull();
  });

  it("foco na BLD: a conta da padaria é recusada, com a mensagem clara", async () => {
    emFoco("bld-f1");
    const motivo = await recusaDoFoco(ctx(), empresasDasContas("t1", ["conta-bld-f7", "conta-padaria"]));
    expect(motivo).toMatch(/^Nada foi gravado: você está trabalhando só em BLD 1 \(com a matriz e 20 filiais\)/);
  });

  it("foco na empresa sem filial: só ela", async () => {
    emFoco("padaria");
    expect(await recusaDoFoco(ctx(), ["padaria"])).toBeNull();
    expect(await recusaDoFoco(ctx(), ["bld"])).toContain("Padaria do Zé");
  });

  it("empresa vazia ou nula não conta", async () => {
    emFoco("padaria");
    expect(await recusaDoFoco(ctx(), [null, undefined, "", "padaria"])).toBeNull();
    expect(await recusaDoFoco(ctx(), [])).toBeNull();
  });
});

describe("leituraNoFoco — as exportações", () => {
  it("sem foco, 'todas' é o escritório", async () => {
    expect(await leituraNoFoco(ctx(), "todas")).toEqual({ ok: true, empresaId: undefined, empresaIds: undefined });
  });

  it("com foco na BLD, 'todas' é a base, e outra empresa não sai", async () => {
    emFoco("bld");
    const todas = await leituraNoFoco(ctx(), "todas");
    expect(todas.ok && todas.empresaIds).toHaveLength(22);
    expect(await leituraNoFoco(ctx(), "bld-f9")).toEqual({ ok: true, empresaId: "bld-f9", empresaIds: undefined });
    const fora = await leituraNoFoco(ctx(), "padaria");
    expect(fora.ok).toBe(false);
    expect(!fora.ok && fora.erro).toMatch(/^Nada foi exportado/);
  });
});

describe("a chave do foco por setor (29/10/2026)", () => {
  it("setor sem a chave mexida usa o foco, como antes", async () => {
    expect(await podeUsarOFoco(ctx())).toBe(true);
    CHAVES = [{ code: "bpo", companyFocus: null }];
    expect(await podeUsarOFoco(ctx())).toBe(true);
  });

  it("desligada no setor, ninguém entra no foco", async () => {
    CHAVES = [{ code: "bpo", companyFocus: false }];
    expect(await podeUsarOFoco(ctx())).toBe(false);
  });

  it("desligada depois, o foco de quem já estava nele deixa de valer", async () => {
    emFoco("padaria");
    expect(await lerEmpresaEmFoco(ctx())).not.toBeNull();
    CHAVES = [{ code: "bpo", companyFocus: false }];
    expect(await lerEmpresaEmFoco(ctx())).toBeNull();
  });

  it("quem não vê o setor não usa o foco, com a chave ligada", async () => {
    expect(await podeUsarOFoco(ctx({ sectors: ["fiscal"] }))).toBe(false);
  });
});
