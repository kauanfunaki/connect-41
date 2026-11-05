import { beforeEach, describe, expect, it, vi } from "vitest";

// As ações do Estoque (05/11/2026): quem pode, e o movimento gravado junto do histórico.

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "SECTOR_USER", sectors: ["financeiro"], subscriptionReadOnly: false },
  niveis: new Set<string>(["ver", "agir"]),
  item: { id: "i1", name: "Notebook", kind: "patrimonio", status: "DISPONIVEL", quantity: 1, holderUserId: null, holderName: null, location: "Sala 2" } as Record<string, unknown> | null,
  pessoa: { name: "Ana" } as { name: string } | null,
  gravados: [] as { modelo: string; dados: Record<string, unknown> }[],
}));

vi.mock("@/lib/auth/context", async () => {
  const papeis = await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis");
  return { ...papeis, getAuthContext: async () => m.ctx };
});
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: async (_: unknown, __: string, nivel: string) => m.niveis.has(nivel) }));
vi.mock("@/lib/prisma", () => {
  const prisma = {
    inventoryItem: {
      findFirst: async () => m.item,
      update: (args: { data: Record<string, unknown> }) => ({ modelo: "inventoryItem.update", dados: args.data }),
      delete: async () => ({}),
    },
    inventoryMovement: { create: (args: { data: Record<string, unknown> }) => ({ modelo: "inventoryMovement.create", dados: args.data }) },
    user: { findFirst: async () => m.pessoa, findUnique: async () => ({ name: "Quem registrou" }) },
    $transaction: async (ops: { modelo: string; dados: Record<string, unknown> }[]) => {
      m.gravados.push(...ops);
      return ops;
    },
  };
  return { getPrisma: () => prisma };
});
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { movimentarItemDoEstoque, salvarItemDoEstoque, excluirItemDoEstoque } = await import("./actions");

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  m.ctx = { tenantId: "t1", userId: "u1", role: "SECTOR_USER", sectors: ["financeiro"], subscriptionReadOnly: false };
  m.niveis = new Set(["ver", "agir"]);
  m.item = { id: "i1", name: "Notebook", kind: "patrimonio", status: "DISPONIVEL", quantity: 1, holderUserId: null, holderName: null, location: "Sala 2" };
  m.pessoa = { name: "Ana" };
  m.gravados = [];
});

describe("movimentar", () => {
  it("entregar para uma pessoa do escritório grava o item e o histórico juntos, com o nome dela", async () => {
    expect(await movimentarItemDoEstoque("i1", null, form({ tipo: "ENTREGA", holderUserId: "u9" }))).toBeNull();
    expect(m.gravados.map((g) => g.modelo)).toEqual(["inventoryItem.update", "inventoryMovement.create"]);
    expect(m.gravados[0]!.dados).toMatchObject({ status: "EM_USO", holderUserId: "u9", holderName: "Ana" });
    expect(m.gravados[1]!.dados).toMatchObject({ type: "ENTREGA", holderName: "Ana", createdByName: "Quem registrou" });
  });

  it("pessoa de outro escritório é recusada", async () => {
    m.pessoa = null;
    expect(await movimentarItemDoEstoque("i1", null, form({ tipo: "ENTREGA", holderUserId: "u-de-fora" }))).toEqual({ error: "Pessoa não encontrada neste escritório." });
    expect(m.gravados).toEqual([]);
  });

  it("quem não age no Financeiro não movimenta", async () => {
    m.niveis = new Set(["ver"]);
    expect(await movimentarItemDoEstoque("i1", null, form({ tipo: "ENTREGA", holderName: "Ana" }))).toEqual({ error: "Você não tem permissão no Estoque." });
  });

  it("conferir registra a data da conferência", async () => {
    expect(await movimentarItemDoEstoque("i1", null, form({ tipo: "CONFERENCIA" }))).toBeNull();
    expect(m.gravados[0]!.dados.lastCheckedAt).toBeInstanceOf(Date);
  });
});

describe("cadastrar e excluir", () => {
  it("cadastrar é da coordenação", async () => {
    expect(await salvarItemDoEstoque(null, null, form({ kind: "material", name: "Papel", category: "Escritório" }))).toEqual({ error: "Só a coordenação do Financeiro cadastra e edita itens." });
  });

  it("excluir é só do administrador", async () => {
    m.ctx = { ...m.ctx, role: "SECTOR_ADMIN" };
    m.niveis = new Set(["ver", "agir", "gerir"]);
    expect(await excluirItemDoEstoque("i1")).toEqual({ error: "Só o Administrador ou o Super Admin pode excluir." });
  });
});
