import { beforeEach, describe, expect, it, vi } from "vitest";

// O prazo para cobrar o órgão (lote 5, 28/10/2026): só quem administra o
// setor, só as opções da tela, e a troca fica na auditoria.

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", subscriptionReadOnly: false } as Record<string, unknown>,
  gerencia: true,
  linha: null as { cobrarProtocoloAposDias: number | null } | null,
  upsert: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/papeis", () => ({ canManageSector: () => m.gerencia }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true, setoresDoModulo: async () => null }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ tenantSocietarioConfig: { findUnique: async () => m.linha, upsert: m.upsert } }) }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { definirCobrancaDoProtocolo } = await import("./actions");

beforeEach(() => {
  m.gerencia = true;
  m.linha = null;
  m.upsert.mockReset();
  m.logAudit.mockReset();
});

describe("o prazo para cobrar o órgão", () => {
  it("grava e registra a troca", async () => {
    expect(await definirCobrancaDoProtocolo("20")).toEqual({ ok: true });
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { tenantId: "t1", cobrarProtocoloAposDias: 20 } }));
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "societario.cobranca_de_protocolo", metadata: { antes: null, depois: 20 } }));
  });

  it("o mesmo valor não vai para a auditoria; fora das opções e sem gerência, recusa", async () => {
    m.linha = { cobrarProtocoloAposDias: 20 };
    await definirCobrancaDoProtocolo("20");
    expect(m.logAudit).not.toHaveBeenCalled();
    expect(await definirCobrancaDoProtocolo("16")).toEqual({ erro: "Prazo inválido." });
    m.gerencia = false;
    expect(await definirCobrancaDoProtocolo("30")).toMatchObject({ erro: expect.stringContaining("administra") });
  });
});
