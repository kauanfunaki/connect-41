import { beforeEach, describe, expect, it, vi } from "vitest";

// Cofre por setor (05/11/2026): cada credencial é de um setor, e quem revela,
// edita ou cria é decidido pelo setor dela — o DP não chega às senhas do BPO.

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "SECTOR_USER", sectors: ["dp"], subscriptionReadOnly: false, activeSector: null as string | null },
  credencial: { passwordEnc: "cifrada", sectorCode: "bpo", id: "c1" } as Record<string, unknown> | null,
  criadas: [] as Record<string, unknown>[],
  vistas: 0,
  ligado: true,
}));

vi.mock("@/lib/auth/context", async () => {
  const papeis = await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis");
  return { ...papeis, getAuthContext: async () => m.ctx };
});
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    bpoCredential: {
      findFirst: async () => m.credencial,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        m.criadas.push(data);
        return { id: "nova" };
      },
      update: async () => ({}),
      delete: async () => ({}),
    },
    bpoCredentialView: { create: async () => { m.vistas++; return {}; } },
  }),
}));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (s: string) => `cifrada:${s}`, decryptSecret: () => "senha-do-portal" }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => m.ligado }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { revelarCredencial, criarCredencial, atualizarCredencial } = await import("./actions");

const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  m.ctx = { tenantId: "t1", userId: "u1", role: "SECTOR_USER", sectors: ["dp"], subscriptionReadOnly: false, activeSector: null };
  m.credencial = { passwordEnc: "cifrada", sectorCode: "bpo", id: "c1" };
  m.criadas = [];
  m.vistas = 0;
  m.ligado = true;
});

describe("revelar", () => {
  it("o DP não revela a senha do BPO, e nada fica registrado como visto", async () => {
    expect(await revelarCredencial("c1")).toEqual({ error: "Sem permissão para ver esta credencial." });
    expect(m.vistas).toBe(0);
  });

  it("quem é do setor da credencial revela, e o acesso fica registrado", async () => {
    m.credencial = { passwordEnc: "cifrada", sectorCode: "dp", id: "c1" };
    expect(await revelarCredencial("c1")).toEqual({ password: "senha-do-portal" });
    expect(m.vistas).toBe(1);
  });
});

describe("criar e editar", () => {
  it("cria no setor da tela, só para quem coordena esse setor", async () => {
    m.ctx = { ...m.ctx, role: "SECTOR_ADMIN", sectors: ["dp"] };
    expect(await criarCredencial("bpo", null, formulario({ title: "Banco", password: "x" }))).toEqual({ error: "Só a coordenação do setor pode cadastrar credenciais." });
    expect(await criarCredencial("dp", null, formulario({ title: "Portal do eSocial", password: "x" }))).toBeNull();
    expect(m.criadas).toEqual([expect.objectContaining({ sectorCode: "dp", title: "Portal do eSocial" })]);
  });

  it("com o módulo desligado, não cria", async () => {
    m.ctx = { ...m.ctx, role: "ADMIN", sectors: [] };
    m.ligado = false;
    expect(await criarCredencial("dp", null, formulario({ title: "Banco", password: "x" }))).toEqual({ error: "O Repositório de senhas está desligado." });
  });

  it("o coordenador do DP não edita a credencial do BPO", async () => {
    m.ctx = { ...m.ctx, role: "SECTOR_ADMIN", sectors: ["dp"] };
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco" }))).toEqual({ error: "Só a coordenação do setor pode editar credenciais." });
  });
});
