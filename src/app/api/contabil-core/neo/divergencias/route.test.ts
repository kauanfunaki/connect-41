import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  consultar: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/contabil-core/servidor/painel", () => ({ consultarDivergencias: m.consultar }));
const rota = await import("./route");

// "Conflitos e qualidade" (Fase D1): quem vê o módulo consulta (o `neo.read`), a empresa e os filtros vão ao
// serviço conferidos, e a resposta volta como o serviço a montou.

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const AGENCIA = "00000000-0000-4000-8000-000000000002";
const URL_BASE = "http://connect/api/contabil-core/neo/divergencias";
const get = (q: string) => rota.GET(new NextRequest(`${URL_BASE}?${q}`));
const RESPOSTA = { totalAvaliadas: 3, totalDivergentes: 2, percentualDivergentes: 66.67, valorTotalDivergente: "50020.00", porConta: [], amostra: [] };

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.consultar.mockResolvedValue({ ok: true, valor: RESPOSTA });
});

describe("divergências da sombra do NEO", () => {
  it("quem só vê consulta, com o mês e a conta bancária, sem cache", async () => {
    const r = await get(`empresa=${EMPRESA.toUpperCase()}&mes=2026-03&agencia=${AGENCIA.toUpperCase()}`);
    expect(r.status).toBe(200);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.consultar).toHaveBeenCalledWith("t1", EMPRESA, { mes: "2026-03", agenciaId: AGENCIA });
    expect(await r.json()).toEqual(RESPOSTA);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    await get(`empresa=${EMPRESA}`);
    expect(m.consultar.mock.calls[1][2]).toEqual({ mes: null, agenciaId: null });
  });

  it("consulta malformada, quem não vê e quem não entrou são recusados antes do serviço", async () => {
    for (const q of ["empresa=x", `empresa=${EMPRESA}&mes=2026-13`, `empresa=${EMPRESA}&mes=junho`, `empresa=${EMPRESA}&agencia=x`]) {
      expect((await get(q)).status, q).toBe(400);
    }
    m.pode.mockResolvedValueOnce(false);
    expect((await get(`empresa=${EMPRESA}`)).status).toBe(403);
    m.ctx = { tenantId: null, userId: null };
    expect((await get(`empresa=${EMPRESA}`)).status).toBe(401);
    expect(m.consultar).not.toHaveBeenCalled();
  });

  it("a empresa de outro escritório é não encontrada", async () => {
    m.consultar.mockResolvedValueOnce({ ok: false, erro: "Empresa não encontrada no Contábil Core." });
    const r = await get(`empresa=${EMPRESA}`);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "Empresa não encontrada no Contábil Core." });
  });
});
