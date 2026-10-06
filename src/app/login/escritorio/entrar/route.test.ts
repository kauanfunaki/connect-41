import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

// O segundo passo da entrada com o e-mail em mais de um escritório
// (06/10/2026): só entra numa conta que está no token da escolha.

const user = { findFirst: vi.fn() };
const refreshToken = { create: vi.fn() };
const userTenantAccess = { findMany: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ user, refreshToken, userTenantAccess }) }));

const CHAVE = "chave-de-teste";
let POST: typeof import("./route").POST;
let signEquipeEscolha: typeof import("@/lib/auth/jwt").signEquipeEscolha;
let signPortalEscolha: typeof import("@/lib/auth/jwt").signPortalEscolha;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = CHAVE;
  process.env.JWT_REFRESH_SECRET = "outra-chave-de-teste";
  delete process.env.APP_DOMAIN;
  ({ POST } = await import("./route"));
  ({ signEquipeEscolha, signPortalEscolha } = await import("@/lib/auth/jwt"));
});

beforeEach(() => {
  vi.clearAllMocks();
  userTenantAccess.findMany.mockResolvedValue([]);
  user.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => CONTAS[where.id] ?? null);
});

const CONTAS: Record<string, unknown> = {
  "conta-a": { id: "conta-a", tenantId: "escritorio-a", role: "SECTOR_USER", sectors: [{ sectorCode: "fiscal" }] },
  "conta-b": { id: "conta-b", tenantId: "escritorio-b", role: "SECTOR_ADMIN", sectors: [{ sectorCode: "dp" }] },
};

function escolher(conta: string, token?: string): Promise<Response> {
  const form = new FormData();
  form.set("conta", conta);
  const headers = new Headers();
  if (token) headers.set("cookie", `equipe_escolha=${token}`);
  return POST(new NextRequest("http://localhost/login/escritorio/entrar", { method: "POST", body: form, headers }));
}

function cookie(res: Response, nome: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${nome}=`));
}

function sessao(res: Response) {
  const bruto = decodeURIComponent(cookie(res, "access_token")!.split(";")[0]!.slice("access_token=".length));
  return jwt.verify(bruto, CHAVE) as { sub: string; tenantId: string; role: string; sectors: string[] };
}

describe("escolha do escritório", () => {
  it("entra na conta escolhida, com o papel e os setores dela no escritório dela", async () => {
    const token = signEquipeEscolha({ contas: ["conta-a", "conta-b"], lembrar: true, next: "/dp" });
    const res = await escolher("conta-b", token);

    expect(user.findFirst).toHaveBeenCalledWith({ where: { id: "conta-b", active: true }, include: { sectors: true } });
    expect(sessao(res)).toMatchObject({ sub: "conta-b", tenantId: "escritorio-b", role: "SECTOR_ADMIN", sectors: ["dp"] });
    // O "lembrar" do primeiro passo atravessou a escolha.
    expect(cookie(res, "refresh_token")).toMatch(/Max-Age=2592000/);
    expect(await res.text()).toContain("/dp");
    // A escolha foi usada: o cookie sai.
    expect(cookie(res, "equipe_escolha")).toMatch(/Max-Age=0/);
  });

  it("um id fora do token não entra — nem consulta o banco", async () => {
    const token = signEquipeEscolha({ contas: ["conta-a"], lembrar: false, next: null });
    const res = await escolher("conta-b", token);

    expect(user.findFirst).not.toHaveBeenCalled();
    expect(cookie(res, "access_token")).toBeUndefined();
    expect(await res.text()).toContain("/login/escritorio?erro=fora-da-lista");
  });

  it("token vencido volta ao login com 'a escolha expirou'", async () => {
    const vencido = jwt.sign(
      { kind: "equipe_escolha", contas: ["conta-a"], lembrar: false, next: null, exp: Math.floor(Date.now() / 1000) - 5 },
      `${CHAVE}:equipe-escolha`
    );
    const res = await escolher("conta-a", vencido);
    expect(cookie(res, "access_token")).toBeUndefined();
    expect(await res.text()).toContain("/login?error=escolha-expirou");
    expect(cookie(res, "equipe_escolha")).toMatch(/Max-Age=0/);
  });

  it("token adulterado, de outro tipo ou ausente não entra", async () => {
    const forjado = jwt.sign({ kind: "equipe_escolha", contas: ["conta-a"], lembrar: false, next: null }, "outra-chave");
    for (const token of [forjado, signPortalEscolha(["conta-a"]), undefined]) {
      const res = await escolher("conta-a", token);
      expect(cookie(res, "access_token")).toBeUndefined();
      expect(await res.text()).toContain("/login?error=escolha-expirou");
    }
    expect(user.findFirst).not.toHaveBeenCalled();
  });

  it("conta desativada entre os dois passos não entra", async () => {
    const token = signEquipeEscolha({ contas: ["conta-desativada"], lembrar: false, next: null });
    const res = await escolher("conta-desativada", token);
    expect(cookie(res, "access_token")).toBeUndefined();
    expect(await res.text()).toContain("/login?error=credenciais-invalidas");
  });
});
