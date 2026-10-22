import { beforeEach, describe, expect, it, vi } from "vitest";

// O comprovante de leitura (22/10/2026): a mesma régua da ficha do envio — o
// escritório da sessão e as empresas no alcance —, e o download fica na
// auditoria, não no log de prova do cliente.

const m = vi.hoisted(() => ({
  db: { clientDocument: { findFirst: vi.fn() }, user: { findUnique: vi.fn() } },
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string; userId: string },
  logAudit: vi.fn(),
  lerArquivo: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/scope", () => ({ scopedCompanyWhere: async () => ({ id: { in: ["c1"] } }) }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/clientDocuments", () => ({ lerArquivoDoDocumento: m.lerArquivo }));

const { GET } = await import("./route");

const chamar = () => GET(new Request("http://x/solicitacoes/envios/d1/comprovante"), { params: Promise.resolve({ docId: "d1" }) });

const DOC = {
  id: "d1",
  title: "Guia",
  bodyHtml: "<p>oi</p>",
  fileName: "guia.pdf",
  fileUrl: "t1/guia.pdf",
  requiresSignature: false,
  createdAt: new Date("2026-10-10T12:00:00Z"),
  publishedAt: new Date("2026-10-10T12:00:00Z"),
  scheduledFor: null,
  reminderSentAt: null,
  tenant: { name: "41 Contábil" },
  company: { name: "Padaria", displayName: null, kind: "PESSOA_JURIDICA", cnpj: "12345678000190", cpf: null },
  createdBy: { name: "Ana" },
  recipients: [{ email: "c@p.com", sentAt: null, firstViewedAt: null, signedAt: null, signerName: null, signerIp: null, views: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.db.clientDocument.findFirst.mockResolvedValue(DOC);
  m.db.user.findUnique.mockResolvedValue({ name: "Bruno" });
  m.lerArquivo.mockResolvedValue(Buffer.from("conteudo"));
});

describe("GET comprovante", () => {
  it("procura o envio no escritório e no alcance da pessoa", async () => {
    await chamar();
    expect(m.db.clientDocument.findFirst.mock.calls[0]![0].where).toEqual({ id: "d1", tenantId: "t1", company: { id: { in: ["c1"] } } });
  });

  it("fora do alcance (ou inexistente): 404, sem auditoria", async () => {
    m.db.clientDocument.findFirst.mockResolvedValue(null);
    const r = await chamar();
    expect(r.status).toBe(404);
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("sem sessão: 401", async () => {
    m.ctx = { tenantId: "", userId: "" };
    expect((await chamar()).status).toBe(401);
  });

  it("devolve o PDF para baixar e registra na auditoria", async () => {
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    expect(r.headers.get("Content-Disposition")).toContain('filename="comprovante-d1.pdf"');
    expect(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(m.lerArquivo).toHaveBeenCalledWith("t1/guia.pdf");
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "clientDocument.receipt", entityId: "d1" }));
  });
});
