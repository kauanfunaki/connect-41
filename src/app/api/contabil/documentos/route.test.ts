import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ pode: vi.fn(), empresa: vi.fn(), entradas: vi.fn(), ctx: { tenantId: "t1", userId: "u1" } }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/contabil/servidor", () => ({ empresaContabilVisivel: m.empresa, entradasDoMes: m.entradas }));
const { GET } = await import("./route");
const EMPRESA = "00000000-0000-4000-8000-000000000001";
const req = (extra: Record<string, string> = {}) => new NextRequest("http://connect/api/contabil/documentos?" + new URLSearchParams({ empresa: EMPRESA, mes: "2026-09", fornecedor: "00123456000199", ...extra }));
beforeEach(() => {
  vi.clearAllMocks();
  m.pode.mockResolvedValue(true);
  m.empresa.mockResolvedValue({ id: EMPRESA, cnpj: "00123456000199", baseId: EMPRESA });
  m.entradas.mockResolvedValue([{ chave: "1", cfops: ["1653"] }, { chave: "2", cfops: ["1556"] }]);
});
describe("consulta de notas da regra", () => {
  it("consulta somente o fornecedor, empresa e mês autorizados", async () => {
    const resposta = await GET(req({ cfop: "1653" }));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ notas: [{ chave: "1", cfops: ["1653"] }] });
    expect(m.empresa).toHaveBeenCalledWith(m.ctx, EMPRESA);
    expect(m.entradas).toHaveBeenCalledWith("t1", expect.objectContaining({ id: EMPRESA }), "2026-09", "00123456000199");
    expect(resposta.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("sem permissão e empresa de fora não consultam notas", async () => {
    m.pode.mockResolvedValueOnce(false);
    expect((await GET(req())).status).toBe(404);
    m.empresa.mockResolvedValueOnce(null);
    expect((await GET(req())).status).toBe(404);
    expect(m.entradas).not.toHaveBeenCalled();
  });
  it("recusa competência, fornecedor e CFOP malformados", async () => {
    for (const extra of [{ mes: "2026-99" }, { fornecedor: "123" }, { cfop: "165" }]) expect((await GET(req(extra))).status).toBe(404);
    expect(m.entradas).not.toHaveBeenCalled();
  });
});
