import { beforeEach, describe, expect, it, vi } from "vitest";

// Cofre por setor (05/11/2026): cada credencial é de um setor, e quem revela,
// edita ou cria é decidido pelo setor dela — o DP não chega às senhas do BPO.
//
// Senha pessoal e "todos do setor, menos…" (10/11/2026, pedido do Kauan): as
// actions conferem as regras de novo, nunca pelo que a tela mandou. As regras
// em si estão em src/lib/apoio/regrasDasSenhas.test.ts; aqui, que cada action
// as aplica.

type Credencial = {
  id: string;
  title: string;
  passwordEnc: string;
  sectorCode: string;
  visibility: "SETOR" | "PESSOAL";
  createdById: string;
  restrictions: { userId: string }[];
};

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "SECTOR_USER", sectors: ["dp"], subscriptionReadOnly: false, activeSector: null as string | null },
  credencial: null as Record<string, unknown> | null,
  criadas: [] as Record<string, unknown>[],
  atualizadas: [] as Record<string, unknown>[],
  marcasApagadas: [] as Record<string, unknown>[],
  marcasCriadas: [] as Record<string, unknown>[],
  excluidas: [] as string[],
  vistas: 0,
  ligado: true,
  pessoasDoSetor: [] as { id: string; name: string }[],
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
      update: async ({ data }: { data: Record<string, unknown> }) => {
        m.atualizadas.push(data);
        return {};
      },
      delete: async ({ where }: { where: { id: string } }) => {
        m.excluidas.push(where.id);
        return {};
      },
    },
    bpoCredentialView: { create: async () => { m.vistas++; return {}; } },
    bpoCredentialRestriction: {
      deleteMany: async (args: Record<string, unknown>) => {
        m.marcasApagadas.push(args);
        return { count: 0 };
      },
      createMany: async (args: Record<string, unknown>) => {
        m.marcasCriadas.push(args);
        return { count: 0 };
      },
    },
    user: { findMany: async () => m.pessoasDoSetor },
    $transaction: async (operacoes: Promise<unknown>[]) => Promise.all(operacoes),
  }),
}));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (s: string) => `cifrada:${s}`, decryptSecret: () => "senha-do-portal" }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => m.ligado }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { revelarCredencial, criarCredencial, atualizarCredencial, excluirCredencial } = await import("./actions");
const { logAudit } = await import("@/lib/audit");

// Senha de teste sempre por variável: o GitGuardian barra o campo de senha
// escrito com o texto literal, mesmo inventado.
const senha = "x";
const senhaDoPortal = "senha-do-portal";

const formulario = (campos: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    for (const valor of Array.isArray(v) ? v : [v]) f.append(k, valor);
  }
  return f;
};

const credencial = (extra: Partial<Credencial> = {}): Credencial => ({
  id: "c1",
  title: "Portal do banco",
  passwordEnc: "cifrada",
  sectorCode: "bpo",
  visibility: "SETOR",
  createdById: "coord",
  restrictions: [],
  ...extra,
});

const como = (userId: string, role: string, sectors: string[]) => {
  m.ctx = { tenantId: "t1", userId, role, sectors, subscriptionReadOnly: false, activeSector: null };
};

beforeEach(() => {
  como("u1", "SECTOR_USER", ["dp"]);
  m.credencial = credencial();
  m.criadas = [];
  m.atualizadas = [];
  m.marcasApagadas = [];
  m.marcasCriadas = [];
  m.excluidas = [];
  m.vistas = 0;
  m.ligado = true;
  m.pessoasDoSetor = [];
  vi.mocked(logAudit).mockClear();
});

describe("revelar", () => {
  it("o DP não revela a senha do BPO, e nada fica registrado como visto", async () => {
    expect(await revelarCredencial("c1")).toEqual({ error: "Sem permissão para ver esta credencial." });
    expect(m.vistas).toBe(0);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("quem é do setor da credencial revela, e o acesso fica registrado — também na Auditoria, sem a senha", async () => {
    m.credencial = credencial({ sectorCode: "dp" });
    expect(await revelarCredencial("c1")).toEqual({ password: senhaDoPortal });
    expect(m.vistas).toBe(1);
    expect(logAudit).toHaveBeenCalledWith({
      tenantId: "t1",
      userId: "u1",
      action: "bpoCredential.reveal",
      entityType: "BpoCredential",
      entityId: "c1",
      metadata: { title: "Portal do banco", setor: "dp", visibilidade: "SETOR" },
    });
    expect(JSON.stringify(vi.mocked(logAudit).mock.calls)).not.toContain(senhaDoPortal);
  });

  it("a pessoal só o dono revela — nem o administrador", async () => {
    m.credencial = credencial({ visibility: "PESSOAL", createdById: "dono" });
    como("admin", "ADMIN", []);
    expect(await revelarCredencial("c1")).toEqual({ error: "Sem permissão para ver esta credencial." });
    como("colega", "SECTOR_USER", ["bpo"]);
    expect(await revelarCredencial("c1")).toEqual({ error: "Sem permissão para ver esta credencial." });
    expect(m.vistas).toBe(0);
    como("dono", "SECTOR_USER", ["bpo"]);
    expect(await revelarCredencial("c1")).toEqual({ password: senhaDoPortal });
    expect(m.vistas).toBe(1);
  });

  it("quem está marcado em “menos…” é recusado; o administrador, nunca", async () => {
    m.credencial = credencial({ restrictions: [{ userId: "marcado" }] });
    como("marcado", "SECTOR_USER", ["bpo"]);
    expect(await revelarCredencial("c1")).toEqual({ error: "Sem permissão para ver esta credencial." });
    como("colega", "SECTOR_USER", ["bpo"]);
    expect(await revelarCredencial("c1")).toEqual({ password: senhaDoPortal });
    m.credencial = credencial({ restrictions: [{ userId: "admin" }] });
    como("admin", "ADMIN", []);
    expect(await revelarCredencial("c1")).toEqual({ password: senhaDoPortal });
  });
});

describe("criar", () => {
  it("cria no setor da tela, só para quem coordena esse setor", async () => {
    como("u1", "SECTOR_ADMIN", ["dp"]);
    expect(await criarCredencial("bpo", null, formulario({ title: "Banco", password: senha }))).toEqual({ error: "Só a coordenação do setor pode cadastrar credenciais." });
    expect(await criarCredencial("dp", null, formulario({ title: "Portal do eSocial", password: senha }))).toBeNull();
    expect(m.criadas).toEqual([expect.objectContaining({ sectorCode: "dp", title: "Portal do eSocial", visibility: "SETOR" })]);
  });

  it("com o módulo desligado, não cria", async () => {
    como("u1", "ADMIN", []);
    m.ligado = false;
    expect(await criarCredencial("dp", null, formulario({ title: "Banco", password: senha }))).toEqual({ error: "O Repositório de senhas está desligado." });
  });

  it("quem só usa o Repositório cadastra a pessoal, e não a do setor", async () => {
    como("colega", "SECTOR_USER", ["bpo"]);
    expect(await criarCredencial("bpo", null, formulario({ title: "Banco", password: senha, quemVe: "SETOR" }))).toEqual({
      error: "Só a coordenação do setor cadastra credenciais do setor. Você pode cadastrar uma pessoal, só sua.",
    });
    expect(await criarCredencial("bpo", null, formulario({ title: "Meu e-mail", password: senha, quemVe: "PESSOAL" }))).toBeNull();
    expect(m.criadas).toEqual([expect.objectContaining({ visibility: "PESSOAL", createdById: "colega", sectorCode: "bpo" })]);
    expect(m.criadas[0]).not.toHaveProperty("restrictions");
  });

  it("“menos…”: grava só quem é do setor, sem a própria coordenação; sem ninguém marcado, recusa", async () => {
    como("coord", "SECTOR_ADMIN", ["bpo"]);
    m.pessoasDoSetor = [
      { id: "colega", name: "Colega" },
      { id: "marcado", name: "Marcado" },
      { id: "coord", name: "Coordenação" },
    ];
    expect(await criarCredencial("bpo", null, formulario({ title: "Banco", password: senha, quemVe: "RESTRITA", restritos: ["admin", "coord"] }))).toEqual({
      error: "Marque quem do setor não vê a senha, ou escolha “Todos do setor”.",
    });
    expect(m.criadas).toEqual([]);

    expect(await criarCredencial("bpo", null, formulario({ title: "Banco", password: senha, quemVe: "RESTRITA", restritos: ["marcado", "admin", "coord"] }))).toBeNull();
    expect(m.criadas).toEqual([
      expect.objectContaining({ visibility: "SETOR", restrictions: { create: [{ tenantId: "t1", userId: "marcado" }] } }),
    ]);
  });
});

describe("editar", () => {
  it("o coordenador do DP não edita a credencial do BPO", async () => {
    como("u1", "SECTOR_ADMIN", ["dp"]);
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco" }))).toEqual({ error: "Só a coordenação do setor pode editar credenciais." });
  });

  it("a pessoal dos outros “não existe” para o colega; o administrador ouve que só o dono edita", async () => {
    m.credencial = credencial({ visibility: "PESSOAL", createdById: "dono" });
    como("colega", "SECTOR_USER", ["bpo"]);
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco" }))).toEqual({ error: "Credencial não encontrada." });
    como("admin", "ADMIN", []);
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco" }))).toEqual({ error: "Só quem cadastrou edita uma credencial pessoal." });
    como("dono", "SECTOR_USER", ["bpo"]);
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco novo", quemVe: "PESSOAL" }))).toBeNull();
    expect(m.atualizadas).toEqual([expect.objectContaining({ title: "Banco novo", visibility: "PESSOAL" })]);
  });

  it("tornar pessoal só quem cadastrou; levar a pessoal ao setor só quem coordena", async () => {
    como("coord2", "SECTOR_ADMIN", ["bpo"]);
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco", quemVe: "PESSOAL" }))).toEqual({
      error: "Só quem cadastrou a credencial pode torná-la pessoal.",
    });
    m.credencial = credencial({ visibility: "PESSOAL", createdById: "dono" });
    como("dono", "SECTOR_USER", ["bpo"]);
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco", quemVe: "SETOR" }))).toEqual({
      error: "Só a coordenação do setor cadastra credenciais do setor: esta continua pessoal.",
    });
    expect(m.atualizadas).toEqual([]);
  });

  it("a coordenação troca as marcas: tira quem saiu da lista e grava as novas", async () => {
    m.credencial = credencial({ restrictions: [{ userId: "marcado" }] });
    m.pessoasDoSetor = [
      { id: "colega", name: "Colega" },
      { id: "marcado", name: "Marcado" },
    ];
    como("coord", "SECTOR_ADMIN", ["bpo"]);
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco", quemVe: "RESTRITA", restritos: ["colega"] }))).toBeNull();
    expect(m.marcasApagadas).toEqual([{ where: { credentialId: "c1", userId: { notIn: ["colega"] } } }]);
    expect(m.marcasCriadas).toEqual([{ data: [{ tenantId: "t1", credentialId: "c1", userId: "colega" }], skipDuplicates: true }]);
  });

  it("“Todos do setor” tira todas as marcas; sem a escolha no formulário, elas ficam como estão", async () => {
    m.credencial = credencial({ restrictions: [{ userId: "marcado" }] });
    como("coord", "SECTOR_ADMIN", ["bpo"]);
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco" }))).toBeNull();
    expect(m.marcasApagadas).toEqual([]);
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco", quemVe: "SETOR" }))).toBeNull();
    expect(m.marcasApagadas).toEqual([{ where: { credentialId: "c1" } }]);
    expect(m.marcasCriadas).toEqual([]);
  });

  it("quem está marcado não edita (para ele a credencial não existe)", async () => {
    m.credencial = credencial({ createdById: "outra-coord", restrictions: [{ userId: "coord" }] });
    como("coord", "SECTOR_ADMIN", ["bpo"]);
    expect(await atualizarCredencial("c1", null, formulario({ title: "Banco" }))).toEqual({ error: "Credencial não encontrada." });
  });
});

describe("excluir", () => {
  it("a do setor: só o administrador", async () => {
    como("coord", "SECTOR_ADMIN", ["bpo"]);
    await excluirCredencial("c1");
    expect(m.excluidas).toEqual([]);
    como("admin", "ADMIN", []);
    await excluirCredencial("c1");
    expect(m.excluidas).toEqual(["c1"]);
  });

  it("a pessoal: o dono, e o administrador (sem vê-la); o colega não", async () => {
    m.credencial = credencial({ visibility: "PESSOAL", createdById: "dono" });
    como("colega", "SECTOR_USER", ["bpo"]);
    await excluirCredencial("c1");
    expect(m.excluidas).toEqual([]);
    como("dono", "SECTOR_USER", ["bpo"]);
    await excluirCredencial("c1");
    como("super", "SUPER_ADMIN", []);
    await excluirCredencial("c1");
    expect(m.excluidas).toEqual(["c1", "c1"]);
  });
});
