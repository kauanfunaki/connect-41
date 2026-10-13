import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// O que se testa: a última empresa só vale se ainda existir, for do tenant de
// quem pergunta e aparecer na tela — e erro de banco nunca derruba a tela.

type Empresa = { id: string; tenantId: string };
let EMPRESAS: Empresa[] = [];
let PREFERENCIAS: { userId: string; tenantId: string; companyId: string }[] = [];

const company = {
  // Um `findFirst` de verdade sobre a lista: casa id e tenant do `where`.
  findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
    const achada = EMPRESAS.find((e) => e.id === where.id && e.tenantId === where.tenantId);
    return achada ? { id: achada.id } : null;
  }),
};
const userLastCompany = {
  findUnique: vi.fn(async ({ where }: { where: { userId_tenantId: { userId: string; tenantId: string } } }) => {
    const { userId, tenantId } = where.userId_tenantId;
    const linha = PREFERENCIAS.find((p) => p.userId === userId && p.tenantId === tenantId);
    return linha ? { companyId: linha.companyId } : null;
  }),
  upsert: vi.fn(async () => ({})),
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ company, userLastCompany }) }));

const { lerUltimaEmpresa, gravarUltimaEmpresa, escolherEmpresaDaTela } = await import("./ultimaEmpresa");

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  EMPRESAS = [
    { id: "bld", tenantId: "t1" },
    { id: "fiel", tenantId: "t1" },
    { id: "de-outro", tenantId: "t2" },
  ];
  PREFERENCIAS = [];
});

describe("lerUltimaEmpresa", () => {
  it("devolve a última empresa aberta no workspace", async () => {
    PREFERENCIAS = [{ userId: "u1", tenantId: "t1", companyId: "fiel" }];
    expect(await lerUltimaEmpresa(ctx())).toBe("fiel");
    // A empresa é conferida no tenant da sessão.
    expect(company.findFirst.mock.calls[0]![0].where).toEqual({ tenantId: "t1", id: "fiel" });
  });

  it("é por workspace: a preferência de outro tenant não vale aqui", async () => {
    PREFERENCIAS = [{ userId: "u1", tenantId: "t2", companyId: "de-outro" }];
    expect(await lerUltimaEmpresa(ctx())).toBeNull();
  });

  it("empresa de outro escritório gravada no tenant (dado forjado) não vale", async () => {
    PREFERENCIAS = [{ userId: "u1", tenantId: "t1", companyId: "de-outro" }];
    expect(await lerUltimaEmpresa(ctx())).toBeNull();
  });

  it("empresa excluída depois de aberta não vale", async () => {
    PREFERENCIAS = [{ userId: "u1", tenantId: "t1", companyId: "excluida" }];
    expect(await lerUltimaEmpresa(ctx())).toBeNull();
  });

  it("sem sessão completa, nem consulta", async () => {
    expect(await lerUltimaEmpresa(ctx({ userId: "" }))).toBeNull();
    expect(await lerUltimaEmpresa(ctx({ tenantId: "" }))).toBeNull();
    expect(userLastCompany.findUnique).not.toHaveBeenCalled();
  });

  it("erro do banco (a tabela ainda não existe, por exemplo) vira 'nenhuma', sem derrubar a tela", async () => {
    userLastCompany.findUnique.mockRejectedValueOnce(new Error("Table 'user_last_companies' doesn't exist"));
    expect(await lerUltimaEmpresa(ctx())).toBeNull();
  });
});

describe("gravarUltimaEmpresa", () => {
  it("grava por cima, uma linha por pessoa e workspace", async () => {
    expect(await gravarUltimaEmpresa(ctx(), "bld")).toBe(true);
    const chamada = userLastCompany.upsert.mock.calls[0] as unknown as [
      { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> },
    ];
    expect(chamada[0].where).toEqual({ userId_tenantId: { userId: "u1", tenantId: "t1" } });
    expect(chamada[0].create).toMatchObject({ userId: "u1", tenantId: "t1", companyId: "bld" });
    expect(chamada[0].update).toMatchObject({ companyId: "bld" });
    expect(chamada[0].update.openedAt).toBeInstanceOf(Date);
  });

  it("recusa empresa de outro escritório ou inexistente", async () => {
    expect(await gravarUltimaEmpresa(ctx(), "de-outro")).toBe(false);
    expect(await gravarUltimaEmpresa(ctx(), "nao-existe")).toBe(false);
    expect(userLastCompany.upsert).not.toHaveBeenCalled();
  });

  it("erro ao gravar não sobe para a tela", async () => {
    userLastCompany.upsert.mockRejectedValueOnce(new Error("Unique constraint failed"));
    expect(await gravarUltimaEmpresa(ctx(), "bld")).toBe(false);
  });
});

describe("escolherEmpresaDaTela", () => {
  const LISTA = [
    { id: "alfa", nome: "Alfa" },
    { id: "bld", nome: "BLD" },
    { id: "fiel", nome: "Fiel" },
  ];

  beforeEach(() => {
    EMPRESAS.push({ id: "alfa", tenantId: "t1" }, { id: "inativa", tenantId: "t1" });
  });

  it("abre na última empresa aberta, com os dados da lista da tela", async () => {
    PREFERENCIAS = [{ userId: "u1", tenantId: "t1", companyId: "fiel" }];
    const r = await escolherEmpresaDaTela(ctx(), undefined, LISTA);
    expect(r.escolha).toEqual({ tipo: "empresa", companyId: "fiel", origem: "ultima" });
    expect(r.empresa).toEqual({ id: "fiel", nome: "Fiel" });
  });

  it("sem última, pede para escolher — não abre na primeira em ordem alfabética", async () => {
    const r = await escolherEmpresaDaTela(ctx(), undefined, LISTA);
    expect(r.escolha).toEqual({ tipo: "escolher", motivo: "nenhuma" });
    expect(r.empresa).toBeNull();
  });

  it("a última que a tela não mostra (inativa, fora do recorte) pede para escolher", async () => {
    PREFERENCIAS = [{ userId: "u1", tenantId: "t1", companyId: "inativa" }];
    const r = await escolherEmpresaDaTela(ctx(), undefined, LISTA);
    expect(r.escolha).toEqual({ tipo: "escolher", motivo: "nenhuma" });
  });

  it("com a empresa na URL, nem lê a última", async () => {
    PREFERENCIAS = [{ userId: "u1", tenantId: "t1", companyId: "fiel" }];
    const r = await escolherEmpresaDaTela(ctx(), "bld", LISTA);
    expect(r.escolha).toMatchObject({ companyId: "bld", origem: "url" });
    expect(userLastCompany.findUnique).not.toHaveBeenCalled();
  });

  it("'todas' só onde a tela oferece", async () => {
    expect((await escolherEmpresaDaTela(ctx(), "todas", LISTA, { permitirTodas: true })).escolha).toEqual({ tipo: "todas" });
    expect((await escolherEmpresaDaTela(ctx(), "todas", LISTA)).escolha).toEqual({ tipo: "escolher", motivo: "invalida" });
  });
});
