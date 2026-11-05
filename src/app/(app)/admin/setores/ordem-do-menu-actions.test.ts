import { beforeEach, describe, expect, it, vi } from "vitest";

// Organizar menu (05/11/2026): só o Super Admin grava a ordem, e só grupo e
// tela do catálogo entram nela.

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "SUPER_ADMIN", sectors: [] as string[], subscriptionReadOnly: false },
  setor: { code: "societario", label: "Societário" } as { code: string; label: string } | null,
  gravado: null as null | { create: { ordem: string } },
  apagou: false,
}));

vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    sector: { findFirst: async () => m.setor },
    sectorMenuOrder: {
      upsert: async (args: { create: { ordem: string } }) => {
        m.gravado = args;
        return {};
      },
      deleteMany: async () => {
        m.apagou = true;
        return { count: 1 };
      },
    },
  }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { salvarOrdemDoMenu, restaurarOrdemDoMenu } = await import("./ordem-do-menu-actions");

beforeEach(() => {
  m.ctx = { tenantId: "t1", userId: "u1", role: "SUPER_ADMIN", sectors: [], subscriptionReadOnly: false };
  m.setor = { code: "societario", label: "Societário" };
  m.gravado = null;
  m.apagou = false;
});

describe("salvar a ordem do menu", () => {
  it("o Super Admin grava, e o que não é grupo nem tela do catálogo sai", async () => {
    expect(await salvarOrdemDoMenu("s1", JSON.stringify({ grupos: ["Licenças", "Inventado"], telas: ["societario_robo", "tela_que_nao_existe"] }))).toBeNull();
    expect(JSON.parse(m.gravado!.create.ordem)).toEqual({ grupos: ["Licenças"], telas: ["societario_robo"] });
  });

  it.each(["ADMIN", "SECTOR_ADMIN", "SECTOR_USER", "READONLY"])("%s não grava", async (role) => {
    m.ctx = { ...m.ctx, role };
    expect(await salvarOrdemDoMenu("s1", '{"grupos":["Licenças"]}')).toEqual({ error: "Só o Super Admin organiza o menu dos setores." });
    expect(m.gravado).toBeNull();
  });

  it("assinatura em somente leitura barra até o Super Admin", async () => {
    m.ctx = { ...m.ctx, subscriptionReadOnly: true };
    expect(await salvarOrdemDoMenu("s1", "{}")).toEqual({ error: "Só o Super Admin organiza o menu dos setores." });
  });

  it("setor de outro escritório não é encontrado", async () => {
    m.setor = null;
    expect(await salvarOrdemDoMenu("s-de-outro", "{}")).toEqual({ error: "Setor não encontrado neste escritório." });
    expect(m.gravado).toBeNull();
  });
});

describe("voltar à ordem padrão", () => {
  it("só o Super Admin; apaga a ordem do setor", async () => {
    m.ctx = { ...m.ctx, role: "ADMIN" };
    expect(await restaurarOrdemDoMenu("s1")).toEqual({ error: "Só o Super Admin organiza o menu dos setores." });
    expect(m.apagou).toBe(false);
    m.ctx = { ...m.ctx, role: "SUPER_ADMIN" };
    expect(await restaurarOrdemDoMenu("s1")).toBeNull();
    expect(m.apagou).toBe(true);
  });
});
