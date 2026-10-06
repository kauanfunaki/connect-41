import { beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

// A troca de escritório vista de fora (revisão de 05/10): o que o proxy manda
// para as telas (x-tenant-id, x-user-sectors…) a partir do token e do cookie
// `active_tenant_id` — o caminho de uma "chamada direta" que tente trocar de
// escritório sem passar pela janela de troca.

const CHAVE = "chave-de-teste";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = CHAVE;
  delete process.env.APP_DOMAIN;
  delete process.env.SECTOR_HOST_SUFFIX_ANTIGO;
});

type Token = { sub: string; tenantId: string; role: string; sectors: string[]; accessibleTenants?: string[] };

function abrir(caminho: string, token: Token, opcoes: { escritorio?: string; chave?: string; cabecalhos?: Record<string, string> } = {}) {
  const cookies = [`access_token=${jwt.sign(token, opcoes.chave ?? CHAVE)}`];
  if (opcoes.escritorio) cookies.push(`active_tenant_id=${opcoes.escritorio}`);
  const headers = new Headers({ cookie: cookies.join("; "), ...opcoes.cabecalhos });
  return proxy(new NextRequest(`http://localhost${caminho}`, { headers }));
}

/** O que a requisição leva adiante para as páginas e rotas. */
function identidade(res: Response) {
  const h = (nome: string) => res.headers.get(`x-middleware-request-${nome}`);
  return {
    usuario: h("x-user-id"),
    escritorio: h("x-tenant-id"),
    origem: h("x-home-tenant-id"),
    papel: h("x-user-role"),
    setores: h("x-user-sectors"),
  };
}

const COMUM: Token = { sub: "u1", tenantId: "escritorio-a", role: "SECTOR_USER", sectors: ["fiscal"], accessibleTenants: [] };

describe("troca de escritório no proxy — usuário comum", () => {
  it("o cookie de outro escritório é ignorado: fica no dele, com os setores dele", async () => {
    const res = await abrir("/home", COMUM, { escritorio: "escritorio-b" });
    expect(identidade(res)).toEqual({
      usuario: "u1",
      escritorio: "escritorio-a",
      origem: "escritorio-a",
      papel: "SECTOR_USER",
      setores: "fiscal",
    });
  });

  it("vale também para rota de API", async () => {
    const res = await abrir("/api/qualquer", { ...COMUM, role: "ADMIN" }, { escritorio: "escritorio-b" });
    expect(identidade(res).escritorio).toBe("escritorio-a");
  });

  it("cabeçalhos de identidade vindos do navegador são descartados", async () => {
    const res = await abrir("/home", COMUM, {
      escritorio: "escritorio-b",
      cabecalhos: { "x-tenant-id": "escritorio-b", "x-user-role": "SUPER_ADMIN", "x-user-sectors": "dp" },
    });
    expect(identidade(res)).toMatchObject({ escritorio: "escritorio-a", papel: "SECTOR_USER", setores: "fiscal" });
  });

  it("um token com a lista de escritórios forjada (outra chave) não passa", async () => {
    const forjado = { ...COMUM, accessibleTenants: ["escritorio-a", "escritorio-b"] };
    const api = await abrir("/api/qualquer", forjado, { escritorio: "escritorio-b", chave: "outra-chave" });
    expect(api.status).toBe(401);
    expect(identidade(api).escritorio).toBeNull();
    const pagina = await abrir("/home", forjado, { escritorio: "escritorio-b", chave: "outra-chave" });
    expect(pagina.headers.get("location")).toContain("/login");
    expect(identidade(pagina).escritorio).toBeNull();
  });
});

describe("troca de escritório no proxy — SUPER_ADMIN, como antes", () => {
  const SUPER: Token = {
    sub: "s1",
    tenantId: "escritorio-a",
    role: "SUPER_ADMIN",
    sectors: ["fiscal"],
    accessibleTenants: ["escritorio-a", "escritorio-b"],
  };

  it("troca para um escritório da lista, sem levar os setores do de origem", async () => {
    const res = await abrir("/home", SUPER, { escritorio: "escritorio-b" });
    expect(identidade(res)).toMatchObject({ escritorio: "escritorio-b", origem: "escritorio-a", setores: "" });
  });

  it("escritório fora da lista cai no de origem", async () => {
    const res = await abrir("/home", SUPER, { escritorio: "escritorio-c" });
    expect(identidade(res)).toMatchObject({ escritorio: "escritorio-a", setores: "fiscal" });
  });
});

describe("o mesmo e-mail em dois escritórios (duas contas)", () => {
  // Quem trabalha em dois escritórios tem uma conta em cada: a sessão é da
  // conta escolhida na entrada, com o papel e os setores dela naquele
  // escritório — não uma visita pela troca.
  it("a sessão da conta do outro escritório tem os setores certos de lá", async () => {
    const contaB: Token = { sub: "u2", tenantId: "escritorio-b", role: "SECTOR_ADMIN", sectors: ["dp"], accessibleTenants: [] };
    const res = await abrir("/home", contaB, { escritorio: "escritorio-a" });
    expect(identidade(res)).toEqual({
      usuario: "u2",
      escritorio: "escritorio-b",
      origem: "escritorio-b",
      papel: "SECTOR_ADMIN",
      setores: "dp",
    });
  });
});
