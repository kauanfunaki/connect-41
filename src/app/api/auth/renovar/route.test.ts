import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A volta pela renovação (13/11/2026, bug-693): o proxy manda para cá quem
// chega a uma página sem access token que valha. A rotação em si está em
// src/lib/auth/renovacao.test.ts; aqui, o que a rota responde ao navegador.

const m = vi.hoisted(() => ({ renovar: vi.fn() }));
vi.mock("@/lib/auth/renovacao", () => ({ renovarSessao: m.renovar }));

import { GET } from "./route";
import { POST as renovarPeloSessionKeeper } from "../refresh/route";

const RENOVOU = { ok: true, accessToken: "access-novo", refresh: { token: "refresh-novo", maxAge: 604800 } };

beforeEach(() => {
  m.renovar.mockReset();
  m.renovar.mockResolvedValue(RENOVOU);
});

function voltar(next: string | null, cookie = "refresh_token=refresh-velho") {
  const url = new URL("https://0.0.0.0:3000/api/auth/renovar");
  if (next !== null) url.searchParams.set("next", next);
  return GET(new NextRequest(url, { headers: { cookie } }));
}

/** Nome, valor e atributos de cada cookie gravado. */
function cookies(res: Response) {
  return Object.fromEntries(
    res.headers.getSetCookie().map((c) => {
      const [par, ...attrs] = c.split(";").map((s) => s.trim());
      const [nome, valor] = [par.slice(0, par.indexOf("=")), par.slice(par.indexOf("=") + 1)];
      return [nome, { valor, attrs: attrs.join("; ").toLowerCase() }];
    }),
  );
}

describe("GET /api/auth/renovar", () => {
  it("renovada, volta para a página pedida com a sessão nova — endereço relativo, nunca o do container", async () => {
    const res = await voltar("/bpo/pagar?empresa=e1");
    expect(m.renovar).toHaveBeenCalledWith("refresh-velho");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/bpo/pagar?empresa=e1");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const c = cookies(res);
    expect(c.access_token).toMatchObject({ valor: "access-novo" });
    expect(c.access_token.attrs).toContain("path=/");
    expect(c.refresh_token).toMatchObject({ valor: "refresh-novo" });
    expect(c.refresh_token.attrs).toContain("path=/api/auth");
    expect(c.refresh_token.attrs).toContain("max-age=604800");
    expect(c.c41_renovou).toMatchObject({ valor: "1" });
    expect(c.c41_renovou.attrs).toContain("max-age=30");
  });

  it("a navegação do menu (RSC) volta com a busca dela", async () => {
    expect((await voltar("/home?_rsc=ab12")).headers.get("location")).toBe("/home?_rsc=ab12");
  });

  it("sem destino, volta para a `/`", async () => {
    expect((await voltar(null)).headers.get("location")).toBe("/");
  });

  it("destino de fora (ou de API, que faria laço) não passa: vai para a `/`", async () => {
    for (const fora of ["//exemplo.com", "https://exemplo.com", "/\\exemplo.com", "exemplo.com", "/api/auth/renovar?next=%2Fhome", "/api/qualquer"]) {
      expect((await voltar(fora)).headers.get("location"), fora).toBe("/");
    }
  });

  it("sem sessão que valha, vai ao login com o destino — sem apagar cookie nenhum", async () => {
    m.renovar.mockResolvedValue({ ok: false });
    const res = await voltar("/bpo/pagar?empresa=e1");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login?next=%2Fbpo%2Fpagar%3Fempresa%3De1");
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("sem sessão e sem destino, o login puro", async () => {
    m.renovar.mockResolvedValue({ ok: false });
    expect((await voltar(null, "")).headers.get("location")).toBe("/login");
  });
});

describe("POST /api/auth/refresh (o SessionKeeper)", () => {
  function pedir(cookie: string) {
    return renovarPeloSessionKeeper(new NextRequest("http://localhost/api/auth/refresh", { method: "POST", headers: { cookie } }));
  }

  it("renova pela mesma função e grava os dois cookies", async () => {
    const res = await pedir("refresh_token=refresh-velho");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accessToken: "access-novo" });
    const c = cookies(res);
    expect(c.access_token.valor).toBe("access-novo");
    expect(c.refresh_token.valor).toBe("refresh-novo");
    expect(c.c41_renovou).toBeUndefined();
  });

  it("401 sem o cookie ou quando não renova, sem mexer nos cookies", async () => {
    expect((await pedir("")).status).toBe(401);
    expect(m.renovar).not.toHaveBeenCalled();
    m.renovar.mockResolvedValue({ ok: false });
    const res = await pedir("refresh_token=refresh-velho");
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});
