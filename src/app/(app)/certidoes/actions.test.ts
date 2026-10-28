import { beforeEach, describe, expect, it, vi } from "vitest";

// As actions das certidões (28/10/2026): só quem age no setor, só empresa do
// escritório, respeitando a empresa em foco, e tudo no registro de auditoria.

const m = vi.hoisted(() => ({
  acesso: null as unknown,
  empresa: null as unknown,
  foco: null as string | null,
  emitir: vi.fn(),
  marcar: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }) }));
vi.mock("@/lib/certidoes/acesso", () => ({ acessoAsCertidoes: async () => m.acesso }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ company: { findFirst: async () => m.empresa } }) }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => m.foco }));
vi.mock("@/lib/certidoes/servidor", () => ({ emitirAgora: m.emitir, marcarCertidaoComoVista: m.marcar }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { emitirCertidaoAction, marcarCertidaoComoVistaAction } = await import("./actions");

const ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  m.acesso = { tenantId: "t1", userId: "u1", ctx: { userId: "u1" }, podeEditar: true };
  m.empresa = { id: ID };
  m.foco = null;
  m.emitir.mockReset().mockResolvedValue({ ok: true, situacao: "NEGATIVA", texto: "Certidão Federal: negativa." });
  m.marcar.mockReset().mockResolvedValue({ companyId: "c1" });
  m.logAudit.mockReset();
});

describe("emitir agora", () => {
  it("emite e registra quem pediu e o que saiu", async () => {
    expect(await emitirCertidaoAction(ID, "FEDERAL")).toEqual({ ok: true, texto: "Certidão Federal: negativa." });
    expect(m.emitir).toHaveBeenCalledWith("t1", "u1", ID, "FEDERAL");
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "societario.certidao_emitida", entityType: "Company", entityId: ID, metadata: { tipo: "FEDERAL", situacao: "NEGATIVA" } }));
  });

  it("recusa sem permissão, tipo inventado, empresa de fora e empresa fora do foco", async () => {
    m.acesso = { ...(m.acesso as object), podeEditar: false };
    expect(await emitirCertidaoAction(ID, "FEDERAL")).toMatchObject({ ok: false });
    m.acesso = { ...(m.acesso as object), podeEditar: true };
    expect(await emitirCertidaoAction(ID, "SIMPLIFICADA")).toEqual({ ok: false, erro: "Certidão não encontrada." });
    m.empresa = null;
    expect(await emitirCertidaoAction(ID, "FGTS")).toEqual({ ok: false, erro: "Empresa não encontrada." });
    m.empresa = { id: ID };
    m.foco = "Você está com outra empresa em foco.";
    expect(await emitirCertidaoAction(ID, "FGTS")).toEqual({ ok: false, erro: "Você está com outra empresa em foco." });
    expect(m.emitir).not.toHaveBeenCalled();
  });
});

describe("marcar a positiva como vista", () => {
  it("marca e registra; a que não é positiva do escritório é recusada", async () => {
    expect(await marcarCertidaoComoVistaAction(ID)).toEqual({ ok: true, texto: "Marcada como vista." });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "societario.certidao_vista", entityType: "Certidao", entityId: ID }));
    m.marcar.mockResolvedValueOnce(null);
    expect(await marcarCertidaoComoVistaAction(ID)).toEqual({ ok: false, erro: "Certidão positiva não encontrada." });
  });
});
