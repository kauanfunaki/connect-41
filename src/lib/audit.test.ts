import { beforeEach, describe, expect, it, vi } from "vitest";

// O que se testa: toda linha nova da auditoria leva o nome de quem agiu
// (`actorName`) — é o que a trilha mostra depois que o usuário é excluído.

const user = { findUnique: vi.fn() };
const auditLog = { create: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ user, auditLog }) }));

const { logAudit } = await import("./audit");

beforeEach(() => vi.clearAllMocks());

describe("logAudit", () => {
  it("grava o nome de quem agiu junto do id", async () => {
    user.findUnique.mockResolvedValue({ name: "Ana Souza" });
    await logAudit({ tenantId: "t1", userId: "u1", action: "company.update", entityType: "Company", entityId: "e1" });
    expect(user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { name: true } });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", userId: "u1", actorName: "Ana Souza", action: "company.update", entityType: "Company", entityId: "e1", metadata: undefined },
    });
  });

  it("falha ao gravar não derruba a ação (best-effort)", async () => {
    user.findUnique.mockResolvedValue(null);
    auditLog.create.mockRejectedValue(new Error("coluna actorName não existe"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(logAudit({ tenantId: "t1", userId: "u1", action: "x" })).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
