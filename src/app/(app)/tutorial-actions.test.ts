import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: a ação grava a marca do tutorial da equipe só com a sessão
// da equipe — quem é e de qual escritório vêm dos cabeçalhos do proxy, nunca
// de quem chama. Uma chamada vinda do portal chega sem esses cabeçalhos.

const m = vi.hoisted(() => ({
  marcarTutorialVisto: vi.fn(async () => true),
  ctx: { userId: "u1", tenantId: "t1", homeTenantId: "t1" },
}));
vi.mock("@/lib/tutorial/vistos", () => ({ marcarTutorialVisto: m.marcarTutorialVisto }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));

const { concluirTutorialDaEquipe } = await import("./tutorial-actions");

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { userId: "u1", tenantId: "t1", homeTenantId: "t1" };
});

describe("concluirTutorialDaEquipe", () => {
  it("grava para quem está logado, na versão atual do tutorial da equipe", async () => {
    expect(await concluirTutorialDaEquipe()).toEqual({ ok: true });
    expect(m.marcarTutorialVisto).toHaveBeenCalledWith({ subject: "USER", userId: "u1", tenantId: "t1" }, "equipe", 1);
  });

  it("ignora o que vier de quem chama: dono e escritório são sempre os da sessão", async () => {
    const chamarComArgumentos = concluirTutorialDaEquipe as unknown as (...a: unknown[]) => Promise<{ ok: boolean }>;
    await chamarComArgumentos({ userId: "outro", tenantId: "outro-escritorio", subject: "PORTAL_USER" });
    expect(m.marcarTutorialVisto).toHaveBeenCalledWith({ subject: "USER", userId: "u1", tenantId: "t1" }, "equipe", 1);
  });

  it("Super Admin de visita em outro escritório: a marca fica no escritório de origem", async () => {
    m.ctx = { userId: "suporte", tenantId: "visitado", homeTenantId: "origem" };
    await concluirTutorialDaEquipe();
    expect(m.marcarTutorialVisto).toHaveBeenCalledWith({ subject: "USER", userId: "suporte", tenantId: "origem" }, "equipe", 1);
  });

  it("sem a sessão da equipe (uma chamada pelo portal), não grava", async () => {
    m.ctx = { userId: "", tenantId: "", homeTenantId: "" };
    expect(await concluirTutorialDaEquipe()).toEqual({ ok: false });
    expect(m.marcarTutorialVisto).not.toHaveBeenCalled();
  });

  it("o banco recusou (tabela ainda não existe): devolve ok false, sem lançar", async () => {
    m.marcarTutorialVisto.mockResolvedValueOnce(false);
    expect(await concluirTutorialDaEquipe()).toEqual({ ok: false });
  });
});
