import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

// A entrada por JSON segue a regra do formulário para o e-mail em mais de um
// escritório (06/10/2026): com mais de uma conta conferindo, quem chama diz o
// `tenantId`.

const user = { findMany: vi.fn() };
const refreshToken = { create: vi.fn() };
const userTenantAccess = { findMany: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ user, refreshToken, userTenantAccess }) }));
vi.mock("@/lib/rateLimit", () => ({ hit: () => ({ allowed: true }), reset: vi.fn(), clientIp: () => "ip-de-teste" }));

let POST: typeof import("./route").POST;
let contas: unknown[];

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = "chave-de-teste";
  process.env.JWT_REFRESH_SECRET = "outra-chave-de-teste";
  ({ POST } = await import("./route"));
  const hash = await bcrypt.hash("senha-de-teste", 4);
  contas = ["a", "b"].map((x) => ({
    id: `conta-${x}`,
    tenantId: `escritorio-${x}`,
    name: "Pessoa",
    email: "pessoa@exemplo.com",
    role: "SECTOR_USER",
    passwordHash: hash,
    sectors: [],
    tenant: { name: `Escritório ${x.toUpperCase()}` },
  }));
});

beforeEach(() => {
  vi.clearAllMocks();
  userTenantAccess.findMany.mockResolvedValue([]);
});

function entrar(corpo: Record<string, string>) {
  return POST(new NextRequest("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify(corpo) }));
}

describe("entrada por JSON", () => {
  it("uma conta: entra como antes", async () => {
    user.findMany.mockResolvedValue([contas[0]]);
    const res = await entrar({ email: "pessoa@exemplo.com", password: "senha-de-teste" });
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ id: "conta-a", tenantId: "escritorio-a" });
  });

  it("duas contas sem tenantId: 409 com os escritórios, sem sessão", async () => {
    user.findMany.mockResolvedValue(contas);
    const res = await entrar({ email: "pessoa@exemplo.com", password: "senha-de-teste" });
    expect(res.status).toBe(409);
    expect((await res.json()).escritorios).toEqual([
      { tenantId: "escritorio-a", nome: "Escritório A" },
      { tenantId: "escritorio-b", nome: "Escritório B" },
    ]);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("duas contas com tenantId: entra na daquele escritório", async () => {
    user.findMany.mockResolvedValue(contas);
    const res = await entrar({ email: "pessoa@exemplo.com", password: "senha-de-teste", tenantId: "escritorio-b" });
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ id: "conta-b", tenantId: "escritorio-b" });
  });

  it("tenantId de um escritório que a senha não liberou: credenciais inválidas", async () => {
    user.findMany.mockResolvedValue(contas);
    const res = await entrar({ email: "pessoa@exemplo.com", password: "senha-de-teste", tenantId: "escritorio-c" });
    expect(res.status).toBe(401);
  });
});
