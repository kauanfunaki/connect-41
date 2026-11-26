import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  estatisticas: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/contabil-core/servidor/painel", () => ({ estatisticasDaEmpresa: m.estatisticas }));
const rota = await import("./route");

// O painel da empresa (Fase D1): quem vê o módulo consulta (o `stats.read`), a empresa é conferida e a série
// vai de 1 a 24 meses (12 se não vier), como o `GET /stats` do original.

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const URL_BASE = "http://connect/api/contabil-core/painel";
const get = (q: string) => rota.GET(new NextRequest(`${URL_BASE}?${q}`));
const RESPOSTA = {
  resumo: { totalTransacoes: 3, totalConciliados: 1, totalNaoConciliados: 2, totalRegistros: 2, totalNotas: 0, totalComprovantes: 0, percentualConciliacao: 33.3 },
  mensal: [{ mes: "2026-11", transacoes: 3, registros: 2, comprovantes: 0, notas: 0 }],
  porAgencia: [],
  mesAtual: "2026-11",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.estatisticas.mockResolvedValue({ ok: true, valor: RESPOSTA });
});

describe("painel da empresa", () => {
  it("quem só vê consulta; a série é de 12 meses se não vier", async () => {
    const r = await get(`empresa=${EMPRESA.toUpperCase()}`);
    expect(r.status).toBe(200);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.estatisticas).toHaveBeenCalledWith("t1", EMPRESA, 12);
    expect(await r.json()).toEqual(RESPOSTA);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    await get(`empresa=${EMPRESA}&meses=24`);
    await get(`empresa=${EMPRESA}&meses=1`);
    expect(m.estatisticas.mock.calls.slice(1).map((c) => c[2])).toEqual([24, 1]);
  });

  it("meses fora de 1 a 24, empresa malformada, quem não vê e quem não entrou são recusados", async () => {
    for (const q of [`empresa=${EMPRESA}&meses=0`, `empresa=${EMPRESA}&meses=25`, `empresa=${EMPRESA}&meses=abc`, `empresa=${EMPRESA}&meses=1.5`, "empresa=x"]) {
      expect((await get(q)).status, q).toBe(400);
    }
    m.pode.mockResolvedValueOnce(false);
    expect((await get(`empresa=${EMPRESA}`)).status).toBe(403);
    m.ctx = { tenantId: null, userId: null };
    expect((await get(`empresa=${EMPRESA}`)).status).toBe(401);
    expect(m.estatisticas).not.toHaveBeenCalled();
  });

  it("a empresa de outro escritório é não encontrada", async () => {
    m.estatisticas.mockResolvedValueOnce({ ok: false, erro: "Empresa não encontrada no Contábil Core." });
    expect((await get(`empresa=${EMPRESA}`)).status).toBe(404);
  });
});
