import { beforeEach, describe, expect, it, vi } from "vitest";

// Marcar a guia como paga (28/10/2026): só quem edita no Fiscal, só guia do
// escritório, e respeitando a empresa em foco.

const m = vi.hoisted(() => ({
  acesso: null as unknown,
  guia: null as unknown,
  foco: null as string | null,
  marcar: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }) }));
vi.mock("@/lib/autorizacoes/servidor", () => ({ acessoAsAutorizacoes: async () => m.acesso }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ guia: { findFirst: async () => m.guia } }) }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => m.foco }));
vi.mock("@/lib/guias/servidor", () => ({ marcarGuiaComoPaga: m.marcar }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { marcarGuiaComoPagaAction } = await import("./actions");

const ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  m.acesso = { tenantId: "t1", ctx: { userId: "u1" }, podeEditar: true };
  m.guia = { companyId: "c1" };
  m.foco = null;
  m.marcar.mockReset().mockResolvedValue({ companyId: "c1", descricao: "DAS · 09/2026" });
  m.logAudit.mockReset();
});

describe("marcar a guia como paga", () => {
  it("marca, registra e desmarca", async () => {
    expect(await marcarGuiaComoPagaAction(ID, true)).toEqual({ ok: true });
    expect(m.marcar).toHaveBeenCalledWith("t1", "u1", ID, true);
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "autorizacoes.guia_paga", entityType: "Guia", entityId: ID }));
    await marcarGuiaComoPagaAction(ID, false);
    expect(m.logAudit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "autorizacoes.guia_reaberta" }));
  });

  it("quem só vê não marca", async () => {
    m.acesso = { tenantId: "t1", ctx: { userId: "u1" }, podeEditar: false };
    expect(await marcarGuiaComoPagaAction(ID, true)).toMatchObject({ ok: false });
    expect(m.marcar).not.toHaveBeenCalled();
  });

  it("guia de outro escritório, id inválido ou empresa fora do foco: nada muda", async () => {
    expect(await marcarGuiaComoPagaAction("x", true)).toMatchObject({ ok: false });
    m.guia = null;
    expect(await marcarGuiaComoPagaAction(ID, true)).toEqual({ ok: false, erro: "Guia não encontrada." });
    m.guia = { companyId: "c2" };
    m.foco = "Com a empresa em foco, só dá para mexer nela.";
    expect(await marcarGuiaComoPagaAction(ID, true)).toEqual({ ok: false, erro: "Com a empresa em foco, só dá para mexer nela." });
    expect(m.marcar).not.toHaveBeenCalled();
  });
});
