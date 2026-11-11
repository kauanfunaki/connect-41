import { beforeEach, describe, expect, it, vi } from "vitest";

// O anexo da conta na tela de Aprovações do portal (P03, 11/11/2026): só sai
// o de conta a pagar aguardando aprovação, de empresa do alcance do cliente,
// com o módulo ligado. Fora disso, 404 sem ler o disco.

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  modulos: vi.fn(),
  alcance: vi.fn(),
  lerAnexo: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ financeEntryAttachment: { findFirst: m.findFirst } }) }));
vi.mock("@/lib/modules", () => ({ getEnabledModuleCodes: m.modulos }));
vi.mock("@/app/(portal)/alcance", () => ({ alcanceDoCliente: m.alcance }));
vi.mock("@/lib/financeiro/anexos", () => ({ armazenamentoDosAnexos: { lerAnexo: m.lerAnexo } }));
vi.mock("./servidor", () => ({ MODULO_DE_APROVACOES: "bpo_aprovacoes" }));

import { anexoDaAprovacaoNoPortal, whereDoAnexoNoPortal } from "./anexoNoPortal";

const SESSAO = { sub: "p1", tenantId: "t1" } as Parameters<typeof anexoDaAprovacaoNoPortal>[0];

beforeEach(() => {
  vi.clearAllMocks();
  m.modulos.mockResolvedValue(new Set(["bpo_aprovacoes"]));
  m.alcance.mockResolvedValue({ tipo: "EMPRESAS", tenantId: "t1", companyIds: ["c1", "c2"] });
  m.findFirst.mockResolvedValue({ fileName: "boleto.pdf", fileUrl: "t1/x.pdf", mimeType: "application/pdf" });
  m.lerAnexo.mockResolvedValue(Buffer.from("%PDF"));
});

describe("whereDoAnexoNoPortal", () => {
  it("prende o anexo ao escritório, às empresas do cliente e à conta aguardando aprovação", () => {
    expect(whereDoAnexoNoPortal("t1", ["c1"], "a1")).toEqual({
      id: "a1",
      tenantId: "t1",
      entry: { tenantId: "t1", companyId: { in: ["c1"] }, kind: "PAGAR", approvalStatus: "AGUARDANDO", status: { not: "CANCELADO" } },
    });
  });
});

describe("anexoDaAprovacaoNoPortal", () => {
  it("entrega o arquivo da conta do alcance", async () => {
    const r = await anexoDaAprovacaoNoPortal(SESSAO, "a1");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    expect(r.headers.get("Content-Disposition")).toContain("boleto.pdf");
    expect(m.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: whereDoAnexoNoPortal("t1", ["c1", "c2"], "a1") }));
  });

  it("com o módulo de aprovações desligado, 404 sem ir ao banco", async () => {
    m.modulos.mockResolvedValue(new Set());
    expect((await anexoDaAprovacaoNoPortal(SESSAO, "a1")).status).toBe(404);
    expect(m.findFirst).not.toHaveBeenCalled();
  });

  it("cliente sem empresa nenhuma: 404, nunca 'todas'", async () => {
    m.alcance.mockResolvedValue({ tipo: "EMPRESAS", tenantId: "t1", companyIds: [] });
    expect((await anexoDaAprovacaoNoPortal(SESSAO, "a1")).status).toBe(404);
    expect(m.findFirst).not.toHaveBeenCalled();
  });

  it("anexo fora do escopo responde como inexistente, sem ler o disco", async () => {
    m.findFirst.mockResolvedValue(null);
    expect((await anexoDaAprovacaoNoPortal(SESSAO, "a1")).status).toBe(404);
    expect(m.lerAnexo).not.toHaveBeenCalled();
  });

  it("arquivo sumido do disco: 404", async () => {
    m.lerAnexo.mockResolvedValue(null);
    expect((await anexoDaAprovacaoNoPortal(SESSAO, "a1")).status).toBe(404);
  });
});
