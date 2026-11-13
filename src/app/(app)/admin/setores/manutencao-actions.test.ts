import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// O que se testa: colocar, mudar o aviso e liberar uma tela da manutenção
// (13/11/2026). Só Administrador e Super Admin gravam; tela desligada,
// previsão vencida e aviso comprido são recusados com o motivo; cada gesto vai
// para a auditoria e atualiza o menu de todos; sem a tabela (deploy antes da
// migration), nada é gravado e a janela diz o porquê.

const m = vi.hoisted(() => {
  const db = {
    tenantModule: { findMany: vi.fn(), findUnique: vi.fn() },
    tenantModuleSector: { findMany: vi.fn() },
    tenantModuleMaintenance: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    subscription: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return {
    db,
    ctx: { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN" as UserRole, sectors: [] as string[], subscriptionReadOnly: false },
    logAudit: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const { colocarEmManutencao, tirarDaManutencao } = await import("./manutencao-actions");

// Contas a pagar, do BPO: ligada por padrão no catálogo.
const TELA = "bpo_contas_pagar";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.ctx.role = "ADMIN";
  m.db.tenantModule.findMany.mockResolvedValue([]);
  m.db.tenantModuleSector.findMany.mockResolvedValue([]);
  m.db.subscription.findUnique.mockResolvedValue(null);
  m.db.tenantModuleMaintenance.findMany.mockResolvedValue([]);
  m.db.user.findUnique.mockResolvedValue({ name: "Kauan" });
});

describe("colocarEmManutencao", () => {
  it("grava com quem colocou, registra na auditoria e atualiza o menu de todos", async () => {
    expect(await colocarEmManutencao(TELA, { motivo: "  Saldo somando duas vezes  ", previsao: "" })).toBeUndefined();
    expect(m.db.tenantModuleMaintenance.upsert).toHaveBeenCalledWith({
      where: { tenantId_moduleCode: { tenantId: "escritorio-a", moduleCode: TELA } },
      create: { tenantId: "escritorio-a", moduleCode: TELA, motivo: "Saldo somando duas vezes", previsao: null, porNome: "Kauan" },
      update: { motivo: "Saldo somando duas vezes", previsao: null },
    });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "module.maintenance.start", entityType: "TenantModule", entityId: TELA }));
    expect(m.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("tela que já estava: muda o aviso, e a auditoria diz que mudou", async () => {
    m.db.tenantModuleMaintenance.findMany.mockResolvedValue([
      { moduleCode: TELA, motivo: "antigo", previsao: null, porNome: "Kauan", createdAt: new Date() },
    ]);
    await colocarEmManutencao(TELA, { motivo: "novo", previsao: "" });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "module.maintenance.update" }));
  });

  it("a previsão é lida no horário de São Paulo", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-13T13:00:00Z") });
    try {
      await colocarEmManutencao(TELA, { motivo: "", previsao: "2026-11-13T15:30" });
    } finally {
      vi.useRealTimers();
    }
    const gravado = m.db.tenantModuleMaintenance.upsert.mock.calls[0][0].create;
    expect(gravado.previsao.toISOString()).toBe("2026-11-13T18:30:00.000Z");
    expect(gravado.motivo).toBeNull();
  });

  it("recusa previsão que já passou, aviso comprido e tela desligada — sem gravar", async () => {
    expect(await colocarEmManutencao(TELA, { motivo: "", previsao: "2020-01-01T10:00" })).toEqual({ error: expect.stringContaining("já passou") });
    expect(await colocarEmManutencao(TELA, { motivo: "x".repeat(281), previsao: "" })).toEqual({ error: expect.stringContaining("280") });
    m.db.tenantModule.findMany.mockResolvedValue([{ moduleCode: TELA, enabled: false, sectorCode: null }]);
    expect(await colocarEmManutencao(TELA, { motivo: "", previsao: "" })).toEqual({ error: expect.stringContaining("desligada") });
    expect(m.db.tenantModuleMaintenance.upsert).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("só o administrador: gestor de setor e Tech sem papel de admin são recusados", async () => {
    for (const role of ["SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as UserRole[]) {
      m.ctx.role = role;
      expect(await colocarEmManutencao(TELA, { motivo: "", previsao: "" })).toEqual({ error: expect.any(String) });
    }
    expect(m.db.tenantModuleMaintenance.upsert).not.toHaveBeenCalled();
  });

  it("tela que não existe é recusada", async () => {
    expect(await colocarEmManutencao("nao_existe", { motivo: "", previsao: "" })).toEqual({ error: "Essa tela não existe mais." });
  });

  it("sem a tabela (deploy antes da migration): diz que falta a migration, sem registrar", async () => {
    m.db.tenantModuleMaintenance.findMany.mockRejectedValue(new Error("Table 'tenant_module_maintenance' doesn't exist"));
    expect(await colocarEmManutencao(TELA, { motivo: "", previsao: "" })).toEqual({ error: expect.stringContaining("migration") });
    expect(m.logAudit).not.toHaveBeenCalled();
  });
});

describe("tirarDaManutencao", () => {
  it("apaga a linha, registra e atualiza o menu", async () => {
    expect(await tirarDaManutencao(TELA)).toBeUndefined();
    expect(m.db.tenantModuleMaintenance.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "escritorio-a", moduleCode: TELA } });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "module.maintenance.end", entityId: TELA }));
    expect(m.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("só o administrador libera", async () => {
    m.ctx.role = "SECTOR_ADMIN";
    expect(await tirarDaManutencao(TELA)).toEqual({ error: expect.any(String) });
    expect(m.db.tenantModuleMaintenance.deleteMany).not.toHaveBeenCalled();
  });
});
