import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { esquecerTelasEmManutencaoDoProxy } from "@/lib/manutencao/noProxy";

// Telas em manutenção vistas de fora (13/11/2026): quem é dos setores, ao abrir
// uma tela em manutenção, recebe o aviso no mesmo endereço (reescrita para
// /manutencao?tela=…); quem conserta passa; ação (POST), API e falha da lista
// nunca bloqueiam.

const CHAVE = "chave-de-teste";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = CHAVE;
  delete process.env.APP_DOMAIN;
  delete process.env.SECTOR_HOST_SUFFIX_ANTIGO;
});

type Token = { sub: string; tenantId: string; role: string; sectors: string[]; accessibleTenants?: string[] };

const FISCAL: Token = { sub: "u1", tenantId: "escritorio-a", role: "SECTOR_USER", sectors: ["fiscal"], accessibleTenants: [] };

const lista = vi.fn<(url: string) => Promise<Response>>();

beforeEach(() => {
  esquecerTelasEmManutencaoDoProxy();
  lista.mockReset();
  lista.mockResolvedValue(Response.json({ codigos: ["fiscal_documentos"] }));
  vi.stubGlobal("fetch", vi.fn((url: URL | string) => lista(String(url))));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function abrir(caminho: string, token: Token, opcoes: { metodo?: string; cabecalhos?: Record<string, string> } = {}) {
  const headers = new Headers({ cookie: `access_token=${jwt.sign(token, CHAVE)}`, ...opcoes.cabecalhos });
  return proxy(new NextRequest(`http://localhost${caminho}`, { method: opcoes.metodo ?? "GET", headers }));
}

/** Para onde o proxy reescreveu, ou `null` quando seguiu para a tela pedida. */
function reescrita(res: Response): string | null {
  const destino = res.headers.get("x-middleware-rewrite");
  if (!destino) return null;
  const url = new URL(destino);
  return `${url.pathname}${url.search}`;
}

describe("tela em manutenção no proxy", () => {
  it("quem é do setor recebe o aviso no lugar da tela, com a identidade de sempre", async () => {
    const res = await abrir("/documentos-fiscais", FISCAL);
    expect(reescrita(res)).toBe("/manutencao?tela=fiscal_documentos");
    expect(res.headers.get("x-middleware-request-x-tenant-id")).toBe("escritorio-a");
    expect(lista).toHaveBeenCalledWith("http://localhost/api/manutencao/telas");
  });

  it("vale para o que mora dentro da tela e para a navegação pelo menu (RSC), mantendo a busca", async () => {
    const res = await abrir("/documentos-fiscais/abc?_rsc=1x2y", FISCAL, { cabecalhos: { rsc: "1" } });
    expect(reescrita(res)).toBe("/manutencao?_rsc=1x2y&tela=fiscal_documentos");
  });

  it("tela fora da lista abre normalmente", async () => {
    expect(reescrita(await abrir("/pagar", FISCAL))).toBeNull();
  });

  it("quem conserta passa: Tech, administrador e super admin — e nem pergunta a lista", async () => {
    for (const quem of [
      { ...FISCAL, sectors: ["fiscal", "tech"] },
      { ...FISCAL, role: "ADMIN", sectors: [] },
      { ...FISCAL, role: "SUPER_ADMIN", sectors: [] },
    ]) {
      expect(reescrita(await abrir("/documentos-fiscais", quem)), quem.role).toBeNull();
    }
    expect(lista).not.toHaveBeenCalled();
  });

  it("ação (POST) e API seguem: quem estava com a tela aberta termina o que fazia", async () => {
    expect(reescrita(await abrir("/documentos-fiscais", FISCAL, { metodo: "POST" }))).toBeNull();
    expect(reescrita(await abrir("/api/documentos-fiscais", FISCAL))).toBeNull();
    expect(lista).not.toHaveBeenCalled();
  });

  it("endereço que não é de tela de setor não pergunta a lista", async () => {
    await abrir("/home", FISCAL);
    await abrir("/empresas", FISCAL);
    expect(lista).not.toHaveBeenCalled();
  });

  it("a lista fora do ar não bloqueia nada", async () => {
    lista.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(reescrita(await abrir("/documentos-fiscais", FISCAL))).toBeNull();
    lista.mockResolvedValue(new Response("erro", { status: 500 }));
    esquecerTelasEmManutencaoDoProxy();
    expect(reescrita(await abrir("/documentos-fiscais", FISCAL))).toBeNull();
  });

  it("a pergunta leva a sessão de quem abre, para a rota saber o escritório", async () => {
    const fetchEspiado = vi.fn(async (_url: URL | string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("cookie")).toMatch(/^access_token=.+; active_tenant_id=escritorio-b$/);
      return Response.json({ codigos: [] });
    });
    vi.stubGlobal("fetch", fetchEspiado);
    const headers = new Headers({ cookie: `access_token=${jwt.sign(FISCAL, CHAVE)}; active_tenant_id=escritorio-b` });
    await proxy(new NextRequest("http://localhost/documentos-fiscais", { headers }));
    expect(fetchEspiado).toHaveBeenCalledTimes(1);
  });
});
