import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  carteira: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/contabil-core/servidor/painel", () => ({ carteiraDoEscritorio: m.carteira }));
vi.mock("@/lib/contabil-core/tela", () => ({ mesAtual: () => "2026-11" }));
const rota = await import("./route");

// A carteira do escritório (Fase D1): quem vê o módulo consulta; a consulta é sempre do escritório de quem
// pede (o tenant da sessão, nunca um id vindo da tela); sem competência, vale o mês corrente do escritório.

const URL_BASE = "http://connect/api/contabil-core/carteira";
const get = (q = "") => rota.GET(new NextRequest(`${URL_BASE}${q ? `?${q}` : ""}`));
const RESPOSTA = {
  mes: "2026-08",
  itens: [
    { empresaId: "e1", razaoSocial: "EMPRESA EXEMPLO LTDA", transacoesImportadas: 3, pendentes: 2, classificadas: 0, erros: 1, haExtratoImportado: true, valorTotalPendente: "120.50" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.carteira.mockResolvedValue(RESPOSTA);
});

describe("carteira do escritório", () => {
  it("quem só vê consulta a competência pedida, do próprio escritório", async () => {
    const r = await get("mes=2026-08&tenant=outro");
    expect(r.status).toBe(200);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.carteira).toHaveBeenCalledWith("t1", "2026-08");
    expect(await r.json()).toEqual(RESPOSTA);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("sem competência, o mês corrente do escritório", async () => {
    await get();
    expect(m.carteira).toHaveBeenCalledWith("t1", "2026-11");
  });

  it("competência malformada, quem não vê e quem não entrou são recusados antes da consulta", async () => {
    for (const q of ["mes=2026-13", "mes=2026-1", "mes=0000-01", "mes=agosto"]) expect((await get(q)).status, q).toBe(400);
    m.pode.mockResolvedValueOnce(false);
    expect((await get()).status).toBe(403);
    m.ctx = { tenantId: null, userId: null };
    expect((await get()).status).toBe(401);
    expect(m.carteira).not.toHaveBeenCalled();
  });
});
