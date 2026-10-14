import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalAccessTokenPayload } from "@/lib/auth/types";

// O que se testa: a ação grava a marca do tutorial do portal só com a sessão
// do portal, conferida ativa no banco — o acesso e o escritório vêm dela,
// nunca de quem chama. A sessão da equipe não serve aqui.

const m = vi.hoisted(() => ({
  marcarTutorialVisto: vi.fn(async () => true),
  sessao: null as PortalAccessTokenPayload | null,
}));
vi.mock("@/lib/tutorial/vistos", () => ({ marcarTutorialVisto: m.marcarTutorialVisto }));
vi.mock("@/app/(portal)/usuario", () => ({ sessaoAtivaDoPortal: async () => m.sessao }));

const { concluirTutorialDoPortal } = await import("./tutorial-actions");

const SESSAO: PortalAccessTokenPayload = { kind: "portal", sub: "pu1", tenantId: "t1" };

beforeEach(() => {
  vi.clearAllMocks();
  m.sessao = SESSAO;
});

describe("concluirTutorialDoPortal", () => {
  it("grava para o acesso logado, no escritório da sessão, na versão atual", async () => {
    expect(await concluirTutorialDoPortal()).toEqual({ ok: true });
    expect(m.marcarTutorialVisto).toHaveBeenCalledWith({ subject: "PORTAL_USER", userId: "pu1", tenantId: "t1" }, "portal", 1);
  });

  it("ignora o que vier de quem chama", async () => {
    const chamarComArgumentos = concluirTutorialDoPortal as unknown as (...a: unknown[]) => Promise<{ ok: boolean }>;
    await chamarComArgumentos({ userId: "outro", tenantId: "outro-escritorio", subject: "USER" });
    expect(m.marcarTutorialVisto).toHaveBeenCalledWith({ subject: "PORTAL_USER", userId: "pu1", tenantId: "t1" }, "portal", 1);
  });

  it("sem sessão do portal — só a da equipe, ou acesso desativado: não grava", async () => {
    m.sessao = null;
    expect(await concluirTutorialDoPortal()).toEqual({ ok: false });
    expect(m.marcarTutorialVisto).not.toHaveBeenCalled();
  });

  it("o banco recusou (tabela ainda não existe): devolve ok false, sem lançar", async () => {
    m.marcarTutorialVisto.mockResolvedValueOnce(false);
    expect(await concluirTutorialDoPortal()).toEqual({ ok: false });
  });
});
