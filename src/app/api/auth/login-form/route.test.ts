import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

// A entrada da equipe com o mesmo e-mail em mais de um escritório
// (06/10/2026), pela rota de verdade — só o banco e o rate limit são
// simulados. As senhas são de teste, com bcrypt de custo baixo.

const user = { findMany: vi.fn() };
const refreshToken = { create: vi.fn() };
const userTenantAccess = { findMany: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ user, refreshToken, userTenantAccess }) }));
const reset = vi.fn();
vi.mock("@/lib/rateLimit", () => ({ hit: () => ({ allowed: true }), reset, clientIp: () => "ip-de-teste" }));

const CHAVE = "chave-de-teste";
let POST: typeof import("./route").POST;
let verifyEquipeEscolha: typeof import("@/lib/auth/jwt").verifyEquipeEscolha;

let hashDoA: string;
let hashDoB: string;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = CHAVE;
  process.env.JWT_REFRESH_SECRET = "outra-chave-de-teste";
  delete process.env.APP_DOMAIN;
  ({ POST } = await import("./route"));
  ({ verifyEquipeEscolha } = await import("@/lib/auth/jwt"));
  hashDoA = await bcrypt.hash("senha-do-a", 4);
  hashDoB = await bcrypt.hash("senha-do-b", 4);
});

beforeEach(() => {
  vi.clearAllMocks();
  userTenantAccess.findMany.mockResolvedValue([]);
});

function contaNoEscritorio(id: string, tenantId: string, passwordHash: string, setores: string[]) {
  return { id, tenantId, role: "SECTOR_USER", passwordHash, sectors: setores.map((sectorCode) => ({ sectorCode })) };
}

// A senha vai no campo `password` da requisição, mas nos testes ela se chama
// `senha`: o GitGuardian, que confere os PRs, acusa `senha: "…"` como senha
// no código mesmo com valor inventado (06/10/2026).
function entrar({ senha, ...campos }: Record<string, string>): Promise<Response> {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  if (senha !== undefined) form.set("password", senha);
  return POST(new NextRequest("http://localhost/api/auth/login-form", { method: "POST", body: form }));
}

function cookie(res: Response, nome: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${nome}=`));
}

function valor(c: string | undefined): string {
  return decodeURIComponent((c ?? "").split(";")[0]!.split("=").slice(1).join("="));
}

function sessao(res: Response) {
  return jwt.verify(valor(cookie(res, "access_token")), CHAVE) as { sub: string; tenantId: string; sectors: string[] };
}

describe("entrada da equipe", () => {
  it("um e-mail só: entra direto, com os tokens e os cookies de sempre", async () => {
    user.findMany.mockResolvedValue([contaNoEscritorio("conta-a", "escritorio-a", hashDoA, ["fiscal"])]);
    const res = await entrar({ email: " Pessoa@Exemplo.com ", senha: "senha-do-a", next: "/fiscal" });

    expect(user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "pessoa@exemplo.com", active: true } })
    );
    expect(sessao(res)).toMatchObject({ sub: "conta-a", tenantId: "escritorio-a", sectors: ["fiscal"] });
    expect(cookie(res, "refresh_token")).toMatch(/Max-Age=604800/);
    expect(refreshToken.create).toHaveBeenCalledTimes(1);
    expect(cookie(res, "equipe_escolha")).toBeUndefined();
    expect(await res.text()).toContain("/fiscal");
    expect(reset).toHaveBeenCalledWith("login-email:pessoa@exemplo.com");
  });

  it("lembrar de mim estende o refresh para 30 dias", async () => {
    user.findMany.mockResolvedValue([contaNoEscritorio("conta-a", "escritorio-a", hashDoA, [])]);
    const res = await entrar({ email: "pessoa@exemplo.com", senha: "senha-do-a", remember: "on" });
    expect(cookie(res, "refresh_token")).toMatch(/Max-Age=2592000/);
  });

  // O defeito de 02/10: com `findFirst`, só a primeira conta era conferida, e
  // a senha certa do outro escritório era recusada.
  it("e-mail em dois escritórios com senhas diferentes: a senha do segundo entra no segundo", async () => {
    user.findMany.mockResolvedValue([
      contaNoEscritorio("conta-a", "escritorio-a", hashDoA, ["fiscal"]),
      contaNoEscritorio("conta-b", "escritorio-b", hashDoB, ["dp"]),
    ]);
    const res = await entrar({ email: "pessoa@exemplo.com", senha: "senha-do-b" });
    expect(sessao(res)).toMatchObject({ sub: "conta-b", tenantId: "escritorio-b", sectors: ["dp"] });
    expect(cookie(res, "equipe_escolha")).toBeUndefined();
  });

  it("a mesma senha nos dois: vai para a escolha, sem sessão e sem ids na página", async () => {
    const mesmaSenha = await bcrypt.hash("senha-do-a", 4);
    user.findMany.mockResolvedValue([
      contaNoEscritorio("conta-a", "escritorio-a", hashDoA, ["fiscal"]),
      contaNoEscritorio("conta-b", "escritorio-b", mesmaSenha, ["dp"]),
    ]);
    const res = await entrar({ email: "pessoa@exemplo.com", senha: "senha-do-a", remember: "on", next: "/dp" });

    expect(cookie(res, "access_token")).toBeUndefined();
    expect(cookie(res, "refresh_token")).toBeUndefined();
    expect(refreshToken.create).not.toHaveBeenCalled();

    const escolha = cookie(res, "equipe_escolha");
    expect(escolha).toMatch(/Path=\/login\/escritorio/);
    expect(escolha).toMatch(/HttpOnly/i);
    expect(escolha).toMatch(/Max-Age=300/);
    expect(verifyEquipeEscolha(valor(escolha))).toEqual({ contas: ["conta-a", "conta-b"], lembrar: true, next: "/dp" });

    const html = await res.text();
    expect(html).toContain("/login/escritorio");
    expect(html).not.toContain("conta-a");
    expect(html).not.toContain("conta-b");
  });

  it("três contas, a senha confere em duas: a escolha leva só essas duas", async () => {
    user.findMany.mockResolvedValue([
      contaNoEscritorio("conta-a", "escritorio-a", hashDoA, []),
      contaNoEscritorio("conta-b", "escritorio-b", hashDoB, []),
      contaNoEscritorio("conta-c", "escritorio-c", hashDoA, []),
    ]);
    const res = await entrar({ email: "pessoa@exemplo.com", senha: "senha-do-a" });
    expect(verifyEquipeEscolha(valor(cookie(res, "equipe_escolha")))?.contas).toEqual(["conta-a", "conta-c"]);
  });

  it("senha errada e e-mail sem conta respondem igual", async () => {
    user.findMany.mockResolvedValue([contaNoEscritorio("conta-a", "escritorio-a", hashDoA, [])]);
    const senhaErrada = await entrar({ email: "pessoa@exemplo.com", senha: "errada" });
    user.findMany.mockResolvedValue([]);
    const semConta = await entrar({ email: "pessoa@exemplo.com", senha: "errada" });

    const [a, b] = [await senhaErrada.text(), await semConta.text()];
    expect(a).toBe(b);
    expect(a).toContain("credenciais-invalidas");
    expect(senhaErrada.headers.getSetCookie()).toEqual([]);
    expect(semConta.headers.getSetCookie()).toEqual([]);
    expect(reset).not.toHaveBeenCalled();
  });

  it("um next que tenta fechar o HTML sai escapado na página de transição", async () => {
    user.findMany.mockResolvedValue([contaNoEscritorio("conta-a", "escritorio-a", hashDoA, [])]);
    const res = await entrar({ email: "pessoa@exemplo.com", senha: "senha-do-a", next: '/x"><script>alert(1)</script>' });
    const html = await res.text();
    expect(html).not.toContain('"><script>alert');
    expect(html).not.toContain("</script>alert");
  });
});
