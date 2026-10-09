import { beforeEach, describe, expect, it, vi } from "vitest";

// O limite de tentativas da entrada do portal (08/10/2026). O contador é em
// memória e vale para o arquivo todo: cada teste usa o seu e-mail e o seu IP.
const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  verifyPassword: vi.fn(),
  ip: "10.0.0.1",
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ portalUser: { findMany: m.findMany, findFirst: vi.fn(), update: m.update } }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": m.ip }),
  cookies: async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));
vi.mock("@/lib/auth/password", () => ({ HASH_DESCARTAVEL: "descartavel", verifyPassword: m.verifyPassword }));
vi.mock("@/lib/auth/jwt", () => ({ signPortalEscolha: () => "token", verifyPortalEscolha: () => null }));
vi.mock("@/lib/auth/portal", () => ({ PORTAL_COOKIE: "portal" }));
vi.mock("@/lib/auth/sessaoDoPortal", () => ({
  querLembrar: () => false,
  cookieDaSessaoDoPortal: () => ({ name: "portal", value: "sessao", options: {} }),
}));
vi.mock("@/lib/auth/googleDoPortal", () => ({ COOKIE_DA_ESCOLHA: "escolha", CAMINHO_DO_COOKIE_DA_ESCOLHA: "/portal" }));
vi.mock("@/app/(portal)/usuario", () => ({ MAX_CONTAS_POR_EMAIL: 10 }));

const { entrarNoPortal } = await import("./actions");

const CONTA = {
  id: "c1",
  tenantId: "t1",
  clientGroupId: "g1",
  passwordHash: "hash",
  tenant: { name: "41 Tech" },
  clientGroup: { name: "Grupo Modelo" },
};
const MUITAS = { erro: "Muitas tentativas. Tente de novo em alguns minutos." };
const INVALIDO = { erro: "E-mail ou senha inválidos." };

function tentar(email: string, senha: string) {
  const form = new FormData();
  form.set("email", email);
  form.set("senha", senha);
  return entrarNoPortal(null, form);
}

beforeEach(() => {
  vi.clearAllMocks();
  m.verifyPassword.mockImplementation(async (senha: string) => senha === "a-certa");
});

describe("limite de tentativas na entrada do portal", () => {
  it("a sexta tentativa errada do mesmo e-mail é barrada sem consultar o banco", async () => {
    m.ip = "10.0.0.1";
    m.findMany.mockResolvedValue([CONTA]);
    for (let i = 0; i < 5; i++) expect(await tentar("ana@cliente.com", "errada-" + i)).toEqual(INVALIDO);
    m.findMany.mockClear();
    expect(await tentar("ana@cliente.com", "outra")).toEqual(MUITAS);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("e-mail que não existe é barrado com a mesma mensagem — o limite não diz quem é cliente", async () => {
    m.ip = "10.0.0.2";
    m.findMany.mockResolvedValue([]);
    for (let i = 0; i < 5; i++) expect(await tentar("ninguem@cliente.com", "x" + i)).toEqual(INVALIDO);
    expect(await tentar("ninguem@cliente.com", "y")).toEqual(MUITAS);
  });

  it("a senha certa zera o contador do e-mail", async () => {
    m.ip = "10.0.0.3";
    m.findMany.mockResolvedValue([CONTA]);
    for (let i = 0; i < 4; i++) await tentar("bia@cliente.com", "errada-" + i);
    await expect(tentar("bia@cliente.com", "a-certa")).rejects.toThrow("REDIRECT:/portal");
    // Depois de entrar, volta a ter as cinco tentativas.
    for (let i = 0; i < 5; i++) expect(await tentar("bia@cliente.com", "de-novo-" + i)).toEqual(INVALIDO);
    expect(await tentar("bia@cliente.com", "mais-uma")).toEqual(MUITAS);
  });

  it("o mesmo IP passando de 20 tentativas é barrado, mesmo trocando o e-mail", async () => {
    m.ip = "10.0.0.4";
    m.findMany.mockResolvedValue([]);
    for (let i = 0; i < 20; i++) expect(await tentar(`varredura${i}@cliente.com`, "x")).toEqual(INVALIDO);
    expect(await tentar("varredura-final@cliente.com", "x")).toEqual(MUITAS);
  });
});
