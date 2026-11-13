import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// A busca do seletor de empresa ou pessoa no servidor (13/11/2026,
// melhoria-662): no alcance de quem busca, no máximo 101 linhas por vez.
const banco = vi.hoisted(() => ({
  pedidos: [] as { modelo: string; args: Record<string, unknown> }[],
  empresas: [] as Record<string, unknown>[],
  pessoas: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    company: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        banco.pedidos.push({ modelo: "company", args });
        return banco.empresas;
      }),
    },
    person: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        banco.pedidos.push({ modelo: "person", args });
        return banco.pessoas;
      }),
    },
  }),
}));
const estado = vi.hoisted(() => ({ ctx: null as AuthContext | null }));
vi.mock("@/lib/auth/context", async (original) => ({
  ...(await original<typeof import("@/lib/auth/context")>()),
  getAuthContext: async () => estado.ctx,
}));

const { buscarEntidadesDoSeletor, LIMITE_DA_BUSCA } = await import("./buscaDoSeletor");
const { buscarEntidades } = await import("@/app/(app)/busca-actions");

function ctx(role: AuthContext["role"], sectors: string[], extra: Partial<AuthContext> = {}): AuthContext {
  return { userId: "eu", tenantId: "t1", homeTenantId: "t1", role, sectors, subscriptionReadOnly: false, canSelfRegularizeSubscription: true, activeSector: null, ...extra };
}

beforeEach(() => {
  banco.pedidos = [];
  banco.empresas = [
    { id: "e1", name: "PADARIA ALVORADA LTDA", displayName: "Padaria Alvorada", logoUrl: null, cnpj: "12345678000190", parentCompanyId: null },
    { id: "e2", name: "PADARIA ALVORADA FILIAL", displayName: null, logoUrl: null, cnpj: "12345678000271", parentCompanyId: "e1" },
  ];
  banco.pessoas = [{ id: "p1", name: "Ana Lima", photoUrl: "/f.png" }];
});

const onde = (i = 0) => banco.pedidos[i].args.where as Record<string, unknown>;

describe("busca de empresa", () => {
  it("pelo nome ou pelo apelido, até 101 linhas, com a filial embaixo da matriz", async () => {
    const r = await buscarEntidadesDoSeletor(ctx("SECTOR_USER", ["bpo"]), "COMPANY", "alvorada");
    expect(onde()).toEqual({ tenantId: "t1", OR: [{ name: { contains: "alvorada" } }, { displayName: { contains: "alvorada" } }] });
    expect(banco.pedidos[0].args).toMatchObject({ take: LIMITE_DA_BUSCA + 1, orderBy: { name: "asc" } });
    expect(r.opcoes.map((o) => [o.value, o.label, o.recuo, o.descricao])).toEqual([
      ["e1", "Padaria Alvorada", false, "12.345.678/0001-90"],
      ["e2", "PADARIA ALVORADA FILIAL", true, "12.345.678/0002-71"],
    ]);
  });

  it("só número, com três dígitos ou mais, procura também no CNPJ (sem a pontuação)", async () => {
    await buscarEntidadesDoSeletor(ctx("ADMIN", []), "COMPANY", "12.345");
    expect(onde().OR).toContainEqual({ cnpj: { contains: "12345" } });
    banco.pedidos = [];
    await buscarEntidadesDoSeletor(ctx("ADMIN", []), "COMPANY", "Padaria 123");
    expect(onde().OR).not.toContainEqual(expect.objectContaining({ cnpj: expect.anything() }));
  });

  it("sem termo, as primeiras do escritório; os ids pedidos vêm à parte, no alcance", async () => {
    const r = await buscarEntidadesDoSeletor(ctx("SECTOR_USER", ["dp"]), "COMPANY", "  ", ["e9", "", "e1"]);
    expect(onde(0)).toEqual({ tenantId: "t1" });
    expect(onde(1)).toEqual({ tenantId: "t1", id: { in: ["e9", "e1"] } });
    expect(r.incluidas.map((o) => o.value)).toEqual(["e1", "e2"]);
  });
});

describe("busca de pessoa", () => {
  it("pelo nome, com a foto", async () => {
    const r = await buscarEntidadesDoSeletor(ctx("SECTOR_USER", ["dp"]), "PERSON", "ana");
    expect(banco.pedidos[0].modelo).toBe("person");
    expect(onde()).toEqual({ tenantId: "t1", name: { contains: "ana" } });
    expect(r.opcoes).toEqual([{ value: "p1", label: "Ana Lima", imagem: "/f.png" }]);
    expect(banco.pedidos).toHaveLength(1);
  });
});

describe("a action, por perfil", () => {
  it("usuário comum de um setor busca no escritório inteiro: empresa e pessoa são conhecimento geral", async () => {
    estado.ctx = ctx("SECTOR_USER", ["fiscal"]);
    await buscarEntidades("COMPANY", "alvorada");
    expect(onde()).toMatchObject({ tenantId: "t1" });
    expect(onde()).not.toHaveProperty("sectorCode");
  });

  it("sem escritório na sessão, ou tipo desconhecido, não consulta nada", async () => {
    estado.ctx = ctx("SECTOR_USER", [], { tenantId: "" });
    expect(await buscarEntidades("COMPANY", "x")).toEqual({ opcoes: [], incluidas: [] });
    estado.ctx = ctx("ADMIN", []);
    expect(await buscarEntidades("VAGA" as "COMPANY", "x")).toEqual({ opcoes: [], incluidas: [] });
    expect(banco.pedidos).toHaveLength(0);
  });

  it("termo longo é cortado e os ids pedidos têm teto", async () => {
    estado.ctx = ctx("ADMIN", []);
    await buscarEntidades("PERSON", "a".repeat(300), Array.from({ length: 30 }, (_, i) => `p${i}`));
    expect((onde(0).name as { contains: string }).contains).toHaveLength(100);
    expect((onde(1).id as { in: string[] }).in).toHaveLength(10);
  });
});
