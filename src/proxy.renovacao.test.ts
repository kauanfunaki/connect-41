import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

// Quem chega a uma página sem access token que valha (13/11/2026, bug-693).
//
// Até esta data o proxy tentava renovar ali mesmo (`tryRefresh`), pedindo
// /api/auth/refresh no endereço do pedido. Não renovava ninguém: o cookie do
// refresh só vai a /api/auth (Path), então nunca chegava ao proxy numa página;
// o cookie do access some com o token, aos 15 minutos, e o proxy ia direto ao
// login; e, na produção, o endereço do pedido é https://0.0.0.0:3000, onde o
// servidor não fala https. Agora a navegação passa por /api/auth/renovar, que
// recebe o cookie do refresh, e o proxy não pede nada a ninguém.

const CHAVE = "chave-de-teste";
const SESSAO = { sub: "u1", tenantId: "t1", role: "SECTOR_USER", sectors: ["bpo"], accessibleTenants: [] };

const fetchDoProxy = vi.fn();

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = CHAVE;
  delete process.env.APP_DOMAIN;
  delete process.env.SECTOR_HOST_SUFFIX_ANTIGO;
});

beforeEach(() => {
  fetchDoProxy.mockReset();
  vi.stubGlobal("fetch", fetchDoProxy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const vencido = () => {
  const agora = Math.floor(Date.now() / 1000);
  return jwt.sign({ ...SESSAO, iat: agora - 3600, exp: agora - 60 }, CHAVE);
};

/** Um pedido como o da produção: o endereço do container, em https pelo x-forwarded-proto. */
function abrir(caminho: string, opcoes: { metodo?: string; cookie?: string; cabecalhos?: Record<string, string> } = {}) {
  const headers = new Headers({ ...opcoes.cabecalhos, ...(opcoes.cookie ? { cookie: opcoes.cookie } : {}) });
  return proxy(new NextRequest(`https://0.0.0.0:3000${caminho}`, { method: opcoes.metodo ?? "GET", headers }));
}

/** Caminho e busca do redirect (o servidor do Next o deixa relativo ao responder). */
function destino(res: Response): string | null {
  const location = res.headers.get("location");
  if (!location) return null;
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}

const apagaOAccess = (res: Response) => res.headers.getSetCookie().some((c) => c.startsWith("access_token=;"));

describe("página sem access token que valha", () => {
  it("sem cookie de access (venceu aos 15 minutos): passa pela renovação, com o destino", async () => {
    const res = await abrir("/bpo/pagar?empresa=e1");
    expect(res.status).toBe(307);
    expect(destino(res)).toBe("/api/auth/renovar?next=%2Fbpo%2Fpagar%3Fempresa%3De1");
  });

  it("com o access vencido no cookie: renovação também, sem apagar o cookie no caminho", async () => {
    const res = await abrir("/home", { cookie: `access_token=${vencido()}` });
    expect(destino(res)).toBe("/api/auth/renovar?next=%2Fhome");
    // A resposta de um prefetch simultâneo chegaria depois e apagaria o access novo.
    expect(apagaOAccess(res)).toBe(false);
  });

  it("a navegação do menu (RSC) leva a busca dela", async () => {
    const res = await abrir("/home?_rsc=ab12", { cabecalhos: { rsc: "1" } });
    expect(destino(res)).toBe("/api/auth/renovar?next=%2Fhome%3F_rsc%3Dab12");
  });

  it("na `/`, sem destino", async () => {
    expect(destino(await abrir("/"))).toBe("/api/auth/renovar");
  });

  it("o proxy não pede nada ao servidor: quem renova é a rota", async () => {
    await abrir("/home", { cookie: `access_token=${vencido()}; refresh_token=qualquer` });
    expect(fetchDoProxy).not.toHaveBeenCalled();
  });

  it("acabou de renovar e o access ainda não vale (o cookie não pegou): login, sem laço", async () => {
    const res = await abrir("/home", { cookie: `c41_renovou=1; access_token=${vencido()}` });
    expect(destino(res)).toBe("/login?next=%2Fhome");
    expect(apagaOAccess(res)).toBe(true);
    expect(destino(await abrir("/home", { cookie: "c41_renovou=1" }))).toBe("/login?next=%2Fhome");
  });

  it("ação (POST) e HEAD de aba velha: login, como antes — não viram navegação", async () => {
    for (const metodo of ["POST", "HEAD"]) {
      const res = await abrir("/home", { metodo, cookie: `access_token=${vencido()}` });
      expect(destino(res), metodo).toBe("/login?next=%2Fhome");
    }
  });

  it("API: 401, como antes", async () => {
    expect((await abrir("/api/qualquer")).status).toBe(401);
    expect((await abrir("/api/qualquer", { cookie: `access_token=${vencido()}` })).status).toBe(401);
  });

  it("a rota da renovação é pública: passa sem sessão e sem identidade forjada", async () => {
    const res = await abrir("/api/auth/renovar?next=%2Fhome", { cabecalhos: { "x-user-id": "forjado" } });
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-middleware-request-x-user-id")).toBeNull();
  });

  it("com access token que vale, nada muda", async () => {
    const res = await abrir("/home", { cookie: `access_token=${jwt.sign(SESSAO, CHAVE)}` });
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-middleware-request-x-user-id")).toBe("u1");
  });
});
