import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { FALTA_ATUALIZAR_O_BANCO_DOS_ENVIOS } from "@/lib/envios/lembretePadrao";

// O lembrete padrão dos envios (23/10/2026): só Administrador e Super Admin
// mudam; vale para o escritório de quem pede; só os prazos do formulário do
// envio; a troca vai para a auditoria com o antes e o depois.

const m = vi.hoisted(() => ({
  db: { tenantEnviosConfig: { findUnique: vi.fn(), upsert: vi.fn() } },
  ctx: { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN" as UserRole, subscriptionReadOnly: false },
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const { definirLembretePadraoDosEnvios } = await import("./envios-actions");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.ctx = { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN", subscriptionReadOnly: false };
  m.db.tenantEnviosConfig.findUnique.mockResolvedValue(null);
  m.db.tenantEnviosConfig.upsert.mockResolvedValue({});
});

describe("quem pode", () => {
  it.each(["ADMIN", "SUPER_ADMIN"] as UserRole[])("%s muda", async (role) => {
    m.ctx.role = role;
    expect(await definirLembretePadraoDosEnvios("5")).toEqual({ ok: true });
    expect(m.db.tenantEnviosConfig.upsert).toHaveBeenCalledTimes(1);
  });

  it.each(["SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as UserRole[])("%s não: nada grava, nada vai para a auditoria", async (role) => {
    m.ctx.role = role;
    expect(await definirLembretePadraoDosEnvios("5")).toEqual({ erro: "Só o Administrador ou o Super Admin muda o padrão dos envios." });
    expect(m.db.tenantEnviosConfig.upsert).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("assinatura em somente leitura: nem o administrador", async () => {
    m.ctx.subscriptionReadOnly = true;
    expect(await definirLembretePadraoDosEnvios("5")).toHaveProperty("erro");
    expect(m.db.tenantEnviosConfig.upsert).not.toHaveBeenCalled();
  });
});

describe("o que grava", () => {
  it("grava no escritório de quem pede e audita o antes e o depois", async () => {
    m.db.tenantEnviosConfig.findUnique.mockResolvedValue({ lembreteDias: 2 });
    expect(await definirLembretePadraoDosEnvios("10")).toEqual({ ok: true });
    expect(m.db.tenantEnviosConfig.upsert).toHaveBeenCalledWith({
      where: { tenantId: "escritorio-a" },
      create: { tenantId: "escritorio-a", lembreteDias: 10 },
      update: { lembreteDias: 10 },
    });
    expect(m.logAudit).toHaveBeenCalledWith({
      tenantId: "escritorio-a",
      userId: "admin-1",
      action: "clientDocument.reminder_default",
      entityType: "TenantEnviosConfig",
      entityId: "escritorio-a",
      metadata: { antes: 2, depois: 10 },
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/portal");
  });

  it("vazio é sem lembrete", async () => {
    m.db.tenantEnviosConfig.findUnique.mockResolvedValue({ lembreteDias: 5 });
    expect(await definirLembretePadraoDosEnvios("")).toEqual({ ok: true });
    expect(m.db.tenantEnviosConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { lembreteDias: null } }));
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { antes: 5, depois: null } }));
  });

  it("o mesmo prazo de novo grava, mas não suja a auditoria", async () => {
    m.db.tenantEnviosConfig.findUnique.mockResolvedValue({ lembreteDias: 5 });
    expect(await definirLembretePadraoDosEnvios("5")).toEqual({ ok: true });
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it.each(["3", "abc", "-2", "0"])("prazo fora da tela (%s) recusa", async (valor) => {
    expect(await definirLembretePadraoDosEnvios(valor)).toEqual({ erro: "Prazo inválido." });
    expect(m.db.tenantEnviosConfig.upsert).not.toHaveBeenCalled();
  });

  it("sem a tabela: avisa que falta atualizar o banco", async () => {
    m.db.tenantEnviosConfig.findUnique.mockRejectedValue({ code: "P2021" });
    expect(await definirLembretePadraoDosEnvios("5")).toEqual({ erro: FALTA_ATUALIZAR_O_BANCO_DOS_ENVIOS });
    expect(m.logAudit).not.toHaveBeenCalled();
  });
});
