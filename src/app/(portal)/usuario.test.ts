import { beforeEach, describe, expect, it, vi } from "vitest";

// A sessão do portal é um token sem estado: não há tabela de sessões para
// revogar. O que derruba a sessão de quem trocou de cliente, foi desativado ou
// excluído (13/10/2026) é a conferência no banco — com o `clientGroupId` do
// token, e não só o id da conta.

const m = vi.hoisted(() => ({ findFirst: vi.fn(), getPortalSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ portalUser: { findFirst: m.findFirst } }) }));
vi.mock("@/lib/auth/portal", () => ({ getPortalSession: m.getPortalSession }));
vi.mock("@/lib/modules", () => ({ getEnabledModuleCodes: async () => new Set<string>() }));
vi.mock("./alcance", () => ({ alcanceDoCliente: vi.fn() }));

const { sessaoAtivaDoPortal } = await import("./usuario");

const TOKEN = { kind: "portal", sub: "pu-1", tenantId: "escritorio-a", clientGroupId: "g-antigo" };

beforeEach(() => {
  vi.clearAllMocks();
  m.getPortalSession.mockResolvedValue(TOKEN);
});

describe("sessaoAtivaDoPortal", () => {
  it("confere no banco a conta, o escritório, o cliente do token e se está ativa", async () => {
    m.findFirst.mockResolvedValueOnce({ id: "pu-1" });
    expect(await sessaoAtivaDoPortal()).toEqual(TOKEN);
    expect(m.findFirst).toHaveBeenCalledWith({
      where: { id: "pu-1", tenantId: "escritorio-a", clientGroupId: "g-antigo", active: true },
      select: { id: true },
    });
  });

  it("conta que trocou de cliente, foi desativada ou excluída: sem sessão", async () => {
    // O banco não acha a combinação conta + cliente do token.
    m.findFirst.mockResolvedValueOnce(null);
    expect(await sessaoAtivaDoPortal()).toBeNull();
  });

  it("sem token: nem consulta o banco", async () => {
    m.getPortalSession.mockResolvedValueOnce(null);
    expect(await sessaoAtivaDoPortal()).toBeNull();
    expect(m.findFirst).not.toHaveBeenCalled();
  });
});
