import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { FALTA_ATUALIZAR_O_BANCO_DA_CECI } from "@/lib/portal/ceci";

// A Ceci no portal ligada por empresa (21/10/2026): só Administrador e Super
// Admin ligam; sempre no escritório de quem pede; cada troca vai para a
// auditoria; antes da migration, avisa em vez de quebrar.

const m = vi.hoisted(() => ({
  db: { company: { updateMany: vi.fn(), findFirst: vi.fn() } },
  ctx: { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN" as UserRole, subscriptionReadOnly: false },
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const { definirCeciDaEmpresa } = await import("./ceci-actions");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.ctx = { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN", subscriptionReadOnly: false };
  m.db.company.updateMany.mockResolvedValue({ count: 1 });
  m.db.company.findFirst.mockResolvedValue({ name: "Empresa A", displayName: null });
});

describe("quem pode", () => {
  it.each(["ADMIN", "SUPER_ADMIN"] as UserRole[])("%s liga e desliga", async (role) => {
    m.ctx.role = role;
    expect(await definirCeciDaEmpresa("c1", true)).toEqual({ ok: true });
    expect(await definirCeciDaEmpresa("c1", false)).toEqual({ ok: true });
  });

  it.each(["SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as UserRole[])("%s não: nada grava", async (role) => {
    m.ctx.role = role;
    expect(await definirCeciDaEmpresa("c1", true)).toHaveProperty("erro");
    expect(m.db.company.updateMany).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("assinatura em somente leitura: nem o administrador", async () => {
    m.ctx.subscriptionReadOnly = true;
    expect(await definirCeciDaEmpresa("c1", true)).toHaveProperty("erro");
    expect(m.db.company.updateMany).not.toHaveBeenCalled();
  });
});

describe("o que grava", () => {
  it("só no escritório de quem pede, e audita", async () => {
    expect(await definirCeciDaEmpresa("c1", true)).toEqual({ ok: true });
    expect(m.db.company.updateMany).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "escritorio-a" }, data: { ceciNoPortal: true } });
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "escritorio-a", action: "portal.ceci.ligada", entityType: "Company", entityId: "c1" })
    );
  });

  it("empresa de outro escritório (ou inventada): não encontrada, sem auditoria", async () => {
    m.db.company.updateMany.mockResolvedValue({ count: 0 });
    expect(await definirCeciDaEmpresa("de-outro", true)).toEqual({ erro: "Empresa não encontrada." });
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("valor que não é sim/não: recusa", async () => {
    expect(await definirCeciDaEmpresa("c1", "true" as unknown as boolean)).toEqual({ erro: "Empresa não encontrada." });
  });

  it("antes da migration: avisa que falta atualizar o banco", async () => {
    m.db.company.updateMany.mockRejectedValue(Object.assign(new Error("coluna"), { code: "P2022" }));
    expect(await definirCeciDaEmpresa("c1", true)).toEqual({ erro: FALTA_ATUALIZAR_O_BANCO_DA_CECI });
  });
});
