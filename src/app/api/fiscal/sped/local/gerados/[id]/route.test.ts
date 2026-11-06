import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ pode: vi.fn(), geracao: vi.fn(), empresa: vi.fn(), abrir: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }) }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/auth/scope", () => ({ scopedCompanyWhere: async () => ({ tenantId: "t1" }) }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ spedFiscalGeneration: { findFirst: m.geracao }, company: { findFirst: m.empresa } }) }));
vi.mock("@/lib/fiscal/sped/local/gerados", () => ({ abrirGerado: m.abrir }));
const { GET } = await import("./route");

// O TXT que o agente do motor devolveu (06/11/2026): sai do disco do Connect sem
// ser decodificado. "AÇÃO|é" em ISO-8859-1 não é UTF-8 válido: se a rota
// decodificasse, os bytes mudariam.
const BYTES = new Uint8Array([0x7c, 0x41, 0xc7, 0xc3, 0x4f, 0x7c, 0xe9, 0x0d, 0x0a]);
const SHA = createHash("sha256").update(BYTES).digest("hex");
const ID = "0b6f3c1e-8d2a-4c6b-9f1e-2a3b4c5d6e7f";
const pedido = (id = ID) => [new Request(`http://connect/api/fiscal/sped/local/gerados/${id}`), { params: Promise.resolve({ id }) }] as const;
const corpo = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(BYTES.slice(0, 3)); c.enqueue(BYTES.slice(3)); c.close(); } });

beforeEach(() => {
  vi.clearAllMocks();
  m.pode.mockResolvedValue(true);
  m.geracao.mockResolvedValue({ companyId: "c1", fileName: "sped_icms_ipi_2026-09.txt", filePath: "t1/gerados/r1.txt", fileSha256: SHA, fileBytes: BYTES.length });
  m.empresa.mockResolvedValue({ id: "c1" });
  m.abrir.mockImplementation(async () => ({ corpo: corpo(), tamanho: BYTES.length }));
});

describe("download do SPED devolvido pelo agente", () => {
  it("entrega os bytes exatos, com o nome, o tamanho e o SHA-256 gravados", async () => {
    const r = await GET(...pedido());
    expect(r.status).toBe(200);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(BYTES);
    expect(r.headers.get("Content-Type")).toBe("text/plain; charset=ISO-8859-1");
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="sped_icms_ipi_2026-09.txt"');
    expect(r.headers.get("Content-Length")).toBe(String(BYTES.length));
    expect(r.headers.get("X-Conteudo-SHA256")).toBe(SHA);
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.geracao.mock.calls[0][0].where).toMatchObject({ id: ID, tenantId: "t1" });
  });

  it("sem módulo, id fora do formato, empresa fora do alcance ou geração sem arquivo: 404", async () => {
    m.pode.mockResolvedValue(false);
    expect((await GET(...pedido())).status).toBe(404);
    m.pode.mockResolvedValue(true);
    expect((await GET(...pedido("../../x"))).status).toBe(404);
    m.empresa.mockResolvedValueOnce(null);
    expect((await GET(...pedido())).status).toBe(404);
    m.geracao.mockResolvedValueOnce({ companyId: "c1", fileName: null, filePath: null, fileSha256: null, fileBytes: null });
    expect((await GET(...pedido())).status).toBe(404);
    expect(m.abrir).not.toHaveBeenCalled();
  });

  it("registro com arquivo que sumiu do disco (ou com outro tamanho): 410, com o caminho para resolver", async () => {
    m.abrir.mockResolvedValueOnce(null);
    const r = await GET(...pedido());
    expect(r.status).toBe(410);
    expect((await r.json()).error).toMatch(/Peça a geração de novo/);
    m.abrir.mockResolvedValueOnce({ corpo: corpo(), tamanho: 1 });
    expect((await GET(...pedido())).status).toBe(410);
  });
});
