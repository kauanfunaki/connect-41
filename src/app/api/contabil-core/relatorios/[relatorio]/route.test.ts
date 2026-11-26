import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  relatorio: vi.fn(),
  planilha: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/contabil-core/servidor/relatorios", () => ({ relatorioDaEmpresa: m.relatorio, planilhaDoRelatorioDaEmpresa: m.planilha }));
const rota = await import("./route");

// Os relatórios (Fase D2): quem vê o módulo consulta (o `relatorios.read`), a empresa é conferida no servidor, o
// período são datas inclusivas e opcionais, e `formato=xlsx` baixa a planilha.

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const get = (relatorio: string, q: string) =>
  rota.GET(new NextRequest(`http://connect/api/contabil-core/relatorios/${relatorio}?${q}`), { params: Promise.resolve({ relatorio }) });
const DRE = {
  dataDe: "2026-03-01", dataAte: "2026-03-31", grupos: [], totalReceitas: "0.00", totalCustos: "0.00", totalDespesas: "0.00", resultadoLiquido: "0.00",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.relatorio.mockResolvedValue({ ok: true, valor: DRE });
  m.planilha.mockResolvedValue({ ok: true, valor: { nome: "dre-99000000000191-2026-03-01-2026-03-31.xlsx", conteudo: Buffer.from("PK") } });
});

describe("relatórios", () => {
  it("quem só vê consulta os três relatórios, com o período em datas", async () => {
    for (const qual of ["dre", "balancete", "livro-caixa"]) {
      const r = await get(qual, `empresa=${EMPRESA.toUpperCase()}&de=2026-03-01&ate=2026-03-31`);
      expect(r.status, qual).toBe(200);
      expect(await r.json()).toEqual(DRE);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.relatorio.mock.calls).toEqual(
      ["dre", "balancete", "livro-caixa"].map((q) => [q, "t1", EMPRESA, { de: "2026-03-01", ate: "2026-03-31" }]),
    );
    expect(m.planilha).not.toHaveBeenCalled();
  });

  it("sem datas é todo o período; uma ponta só também vale", async () => {
    await get("balancete", `empresa=${EMPRESA}`);
    await get("balancete", `empresa=${EMPRESA}&de=&ate=2026-12-31`);
    await get("livro-caixa", `empresa=${EMPRESA}&de=2026-01-01`);
    expect(m.relatorio.mock.calls.map((c) => c[3])).toEqual([
      { de: null, ate: null },
      { de: null, ate: "2026-12-31" },
      { de: "2026-01-01", ate: null },
    ]);
  });

  it("formato=xlsx baixa a planilha do relatório", async () => {
    const r = await get("dre", `empresa=${EMPRESA}&de=2026-03-01&ate=2026-03-31&formato=xlsx`);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="dre-99000000000191-2026-03-01-2026-03-31.xlsx"');
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe("PK");
    expect(m.planilha).toHaveBeenCalledWith("dre", "t1", EMPRESA, { de: "2026-03-01", ate: "2026-03-31" });
    expect(m.relatorio).not.toHaveBeenCalled();
  });

  it("relatório desconhecido, data inválida, outro formato, empresa malformada, quem não vê e quem não entrou são recusados", async () => {
    expect((await get("razao", `empresa=${EMPRESA}`)).status).toBe(404);
    for (const q of [
      `empresa=${EMPRESA}&de=2026-02-30`,
      `empresa=${EMPRESA}&ate=2026-3-1`,
      `empresa=${EMPRESA}&de=2026-03-01T10:00:00Z`,
      `empresa=${EMPRESA}&de=0000-01-01`,
      `empresa=${EMPRESA}&formato=csv`,
      "empresa=x",
    ]) {
      expect((await get("dre", q)).status, q).toBe(400);
    }
    expect(await (await get("dre", `empresa=${EMPRESA}&de=2026-02-30`)).json()).toEqual({ error: "A data inicial deve ser uma data válida (AAAA-MM-DD)." });
    m.pode.mockResolvedValueOnce(false);
    expect((await get("dre", `empresa=${EMPRESA}`)).status).toBe(403);
    m.ctx = { tenantId: null, userId: null };
    expect((await get("dre", `empresa=${EMPRESA}`)).status).toBe(401);
    expect(m.relatorio).not.toHaveBeenCalled();
    expect(m.planilha).not.toHaveBeenCalled();
  });

  it("a empresa de outro escritório é não encontrada, na tela e na planilha", async () => {
    m.relatorio.mockResolvedValueOnce({ ok: false, erro: "Empresa não encontrada no Contábil Core." });
    expect((await get("dre", `empresa=${EMPRESA}`)).status).toBe(404);
    m.planilha.mockResolvedValueOnce({ ok: false, erro: "Empresa não encontrada no Contábil Core." });
    expect((await get("livro-caixa", `empresa=${EMPRESA}&formato=xlsx`)).status).toBe(404);
  });
});
