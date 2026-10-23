import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ pode: vi.fn(), motor: null as unknown, fetch: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }) }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({ abrirMotor: async () => m.motor }));
const { criarClienteDoMotor } = await import("@/lib/sped/motor");
const { GET } = await import("./route");

const XML = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></html>';

function pedido(id: string, query = "raiz=17122471") {
  const req = new Request(`http://connect/api/fiscal/sped/quarentena/${id}/xml?${query}`);
  Object.assign(req, { nextUrl: new URL(req.url) });
  return [req as never, { params: Promise.resolve({ id }) }] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.pode.mockResolvedValue(true);
  m.fetch.mockImplementation(async () => new Response(XML, { headers: { "Content-Type": "application/xml; charset=utf-8" } }));
  m.motor = { raizes: ["17122471"], escrita: false, cliente: criarClienteDoMotor({ baseUrl: "https://motor", token: "t", tokenEscrita: null }, { fetch: m.fetch as never }) };
});

describe("XML da quarentena", () => {
  it("para ver, vai como texto puro, com nosniff e CSP que proíbe tudo", async () => {
    const r = await GET(...pedido("9001"));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(XML);
    expect(r.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(m.pode).toHaveBeenCalledWith(expect.anything(), "fiscal_acervo", "ver");
    expect(String(m.fetch.mock.calls[0][0])).toBe("https://motor/api/connect/v1/quarentena/9001/xml?cnpj_raiz=17122471");
  });
  it("para baixar, com o tipo do motor e attachment", async () => {
    const r = await GET(...pedido("9001", "raiz=17122471&baixar=1"));
    expect(r.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="quarentena-9001.xml"');
  });
  it("sem o módulo, raiz fora do alcance ou id inválido: 404 sem chamar o motor", async () => {
    expect((await GET(...pedido("9001", "raiz=99999999"))).status).toBe(404);
    expect((await GET(...pedido("abc"))).status).toBe(404);
    m.pode.mockResolvedValue(false);
    expect((await GET(...pedido("9001"))).status).toBe(404);
    expect(m.fetch).not.toHaveBeenCalled();
  });
});
