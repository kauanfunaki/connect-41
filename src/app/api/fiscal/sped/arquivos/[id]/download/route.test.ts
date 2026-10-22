import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ pode: vi.fn(), motor: null as unknown, fetch: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }) }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({ abrirMotor: async () => m.motor }));
const { criarClienteDoMotor } = await import("@/lib/sped/motor");
const { GET } = await import("./route");

// "AÇÃO|é" em ISO-8859-1: bytes que não são UTF-8 válido. Se a rota
// decodificasse e recodificasse, eles mudariam.
const BYTES = new Uint8Array([0x7c, 0x30, 0x30, 0x30, 0x30, 0x7c, 0x41, 0xc7, 0xc3, 0x4f, 0x7c, 0xe9, 0x0d, 0x0a]);
const SHA = createHash("sha256").update(BYTES).digest("hex");

function pedido(id: string, raiz = "17122471") {
  return [new Request(`http://connect/api/fiscal/sped/arquivos/${id}/download?raiz=${raiz}`) as never, { params: Promise.resolve({ id }) }] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.pode.mockResolvedValue(true);
  m.fetch.mockImplementation(async () => new Response(new ReadableStream({ start(c) { c.enqueue(BYTES.slice(0, 7)); c.enqueue(BYTES.slice(7)); c.close(); } }), {
    headers: { "Content-Type": "text/plain; charset=ISO-8859-1", "Content-Disposition": 'attachment; filename="icms_ipi_v4.txt"', "Content-Length": String(BYTES.length), "X-Conteudo-SHA256": SHA, "X-Interno": "nao-repassa" },
  }));
  m.motor = { raizes: ["17122471"], escrita: false, cliente: criarClienteDoMotor({ baseUrl: "https://motor", token: "t", tokenEscrita: null }, { fetch: m.fetch as never }) };
});

describe("download do SPED gerado", () => {
  it("repassa os bytes do motor sem mudar nenhum, com os cabeçalhos do contrato", async () => {
    // NextRequest tem nextUrl; aqui basta o que a rota lê.
    const [req, ctx] = pedido("301");
    Object.assign(req, { nextUrl: new URL((req as Request).url) });
    const r = await GET(req, ctx);
    expect(r.status).toBe(200);
    const recebidos = new Uint8Array(await r.arrayBuffer());
    expect(recebidos).toEqual(BYTES);
    expect(createHash("sha256").update(recebidos).digest("hex")).toBe(SHA);
    expect(r.headers.get("Content-Type")).toBe("text/plain; charset=ISO-8859-1");
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="icms_ipi_v4.txt"');
    expect(r.headers.get("X-Conteudo-SHA256")).toBe(SHA);
    expect(r.headers.get("Content-Length")).toBe(String(BYTES.length));
    expect(r.headers.get("X-Interno")).toBeNull();
    expect(String(m.fetch.mock.calls[0][0])).toBe("https://motor/api/connect/v1/arquivos/301/download?cnpj_raiz=17122471");
  });
  it("raiz fora do alcance e sem módulo: 404, sem chamar o motor", async () => {
    const [req, ctx] = pedido("301", "99999999");
    Object.assign(req, { nextUrl: new URL((req as Request).url) });
    expect((await GET(req, ctx)).status).toBe(404);
    m.pode.mockResolvedValue(false);
    const [req2, ctx2] = pedido("301");
    Object.assign(req2, { nextUrl: new URL((req2 as Request).url) });
    expect((await GET(req2, ctx2)).status).toBe(404);
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("404 do motor vira 404 com a mensagem em português", async () => {
    m.fetch.mockResolvedValue(new Response(JSON.stringify({ erro: "x", codigo: "nao_encontrado" }), { status: 404 }));
    const [req, ctx] = pedido("999");
    Object.assign(req, { nextUrl: new URL((req as Request).url) });
    const r = await GET(req, ctx);
    expect(r.status).toBe(404);
    expect((await r.json()).error).toMatch(/não encontrado/);
  });
});
