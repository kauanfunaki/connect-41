import { beforeEach, describe, expect, it, vi } from "vitest";

// A sessão do portal é um token sem estado: não há tabela de sessões para
// revogar. O que derruba a sessão de quem foi desativado ou excluído
// (13/10/2026) é a conferência no banco. Desde 14/10/2026 (portal por empresa)
// o token não diz mais o que a conta vê — as empresas saem do banco a cada
// tela —, e o `clientGroupId` dos tokens antigos é ignorado.

const m = vi.hoisted(() => ({ findFirst: vi.fn(), getPortalSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ portalUser: { findFirst: m.findFirst } }) }));
vi.mock("@/lib/auth/portal", () => ({ getPortalSession: m.getPortalSession }));
vi.mock("@/lib/modules", () => ({ getEnabledModuleCodes: async () => new Set<string>() }));
vi.mock("./alcance", () => ({ alcanceDoCliente: vi.fn() }));

const { sessaoAtivaDoPortal } = await import("./usuario");

const TOKEN = { kind: "portal", sub: "pu-1", tenantId: "escritorio-a" };
const TOKEN_ANTIGO = { ...TOKEN, clientGroupId: "g-antigo" };

beforeEach(() => {
  vi.clearAllMocks();
  m.getPortalSession.mockResolvedValue(TOKEN);
});

describe("sessaoAtivaDoPortal", () => {
  it("confere no banco a conta, o escritório do token e se está ativa", async () => {
    m.findFirst.mockResolvedValueOnce({ id: "pu-1" });
    expect(await sessaoAtivaDoPortal()).toEqual(TOKEN);
    expect(m.findFirst).toHaveBeenCalledWith({
      where: { id: "pu-1", tenantId: "escritorio-a", active: true },
      select: { id: true },
    });
  });

  it("token antigo, com o cliente: continua valendo, e o cliente não entra na conferência", async () => {
    m.getPortalSession.mockResolvedValueOnce(TOKEN_ANTIGO);
    m.findFirst.mockResolvedValueOnce({ id: "pu-1" });
    expect(await sessaoAtivaDoPortal()).toEqual(TOKEN_ANTIGO);
    expect(m.findFirst.mock.calls[0]![0].where).toEqual({ id: "pu-1", tenantId: "escritorio-a", active: true });
  });

  it("conta desativada ou excluída: sem sessão", async () => {
    m.findFirst.mockResolvedValueOnce(null);
    expect(await sessaoAtivaDoPortal()).toBeNull();
  });

  it("sem token: nem consulta o banco", async () => {
    m.getPortalSession.mockResolvedValueOnce(null);
    expect(await sessaoAtivaDoPortal()).toBeNull();
    expect(m.findFirst).not.toHaveBeenCalled();
  });
});
