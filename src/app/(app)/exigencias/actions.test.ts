import { beforeEach, describe, expect, it, vi } from "vitest";

// O prazo para cobrar o órgão (lote 5, 28/10/2026): só quem administra o
// setor, só as opções da tela, e a troca fica na auditoria.

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", subscriptionReadOnly: false } as Record<string, unknown>,
  gerencia: true,
  linha: null as { cobrarProtocoloAposDias: number | null } | null,
  upsert: vi.fn(),
  logAudit: vi.fn(),
  age: true,
  protocolo: null as { id: string; processId: string; organ: { name: string } } | null,
  findProtocolo: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx, canActOnSector: () => m.age }));
vi.mock("@/lib/auth/papeis", () => ({ canManageSector: () => m.gerencia }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true, setoresDoModulo: async () => null }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    tenantSocietarioConfig: { findUnique: async () => m.linha, upsert: m.upsert },
    processProtocol: { findFirst: async (a: unknown) => (m.findProtocolo(a), m.protocolo) },
  }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { definirCobrancaDoProtocolo, registrarCobrancaDoOrgao } = await import("./actions");

beforeEach(() => {
  m.gerencia = true;
  m.linha = null;
  m.upsert.mockReset();
  m.logAudit.mockReset();
  m.age = true;
  m.protocolo = null;
  m.findProtocolo.mockReset();
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

describe("registrar a cobrança do órgão (04/11/2026)", () => {
  it("só protocolo do tenant que espera o órgão; grava na auditoria", async () => {
    m.protocolo = { id: "p1", processId: "proc1", organ: { name: "Junta" } };
    expect(await registrarCobrancaDoOrgao("p1")).toEqual({ ok: true });
    expect(m.findProtocolo).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", tenantId: "t1", outcome: "PENDENTE" } }));
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "societario.protocolo.cobrado", entityType: "ProcessProtocol", entityId: "p1" })
    );
  });

  it("recusa quem não atua no setor, id inválido e protocolo que já andou", async () => {
    m.age = false;
    expect(await registrarCobrancaDoOrgao("p1")).toMatchObject({ erro: expect.stringContaining("atua") });
    m.age = true;
    expect(await registrarCobrancaDoOrgao(42)).toEqual({ erro: "Protocolo inválido." });
    expect(await registrarCobrancaDoOrgao("p9")).toMatchObject({ erro: expect.stringContaining("não está mais") });
    expect(m.logAudit).not.toHaveBeenCalled();
  });
});
