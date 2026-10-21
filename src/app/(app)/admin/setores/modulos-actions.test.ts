import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// O que se testa: o "Também em…" de um módulo (21/10/2026). Só Administrador e
// Super Admin gravam; só setor ativo do escritório entra; o dono nunca vai para
// a lista de setores a mais; cada troca vai para a auditoria; e, sem a tabela
// (deploy antes da migration), nada é gravado nem registrado.

const m = vi.hoisted(() => {
  const db = {
    tenantModule: { findUnique: vi.fn(), upsert: vi.fn() },
    tenantModuleSector: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return {
    db,
    ctx: { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN" as UserRole, sectors: [] as string[], subscriptionReadOnly: false },
    logAudit: vi.fn(),
    revalidatePath: vi.fn(),
    ativos: [{ code: "fiscal" }, { code: "contabil" }, { code: "bpo" }],
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/sectors", () => ({ getActiveSectors: async () => m.ativos }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const { ligarModuloAoSetor, transferirModulo } = await import("./modulos-actions");
const { setoresDoModulo } = await import("@/lib/modules");

// A prévia do SPED: Conferência fiscal, dona Fiscal no catálogo.
const TELA = "fiscal_conferencia";
const gravados = () => m.db.tenantModuleSector.createMany.mock.calls.at(-1)?.[0].data.map((d: { sectorCode: string }) => d.sectorCode);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.ctx.role = "ADMIN";
  m.db.tenantModule.findUnique.mockResolvedValue(null);
  m.db.tenantModuleSector.findMany.mockResolvedValue([]);
});

describe("ligarModuloAoSetor", () => {
  it("liga o Contábil: grava, registra na auditoria e atualiza o menu de todos", async () => {
    await ligarModuloAoSetor(TELA, "contabil", true);
    expect(m.db.tenantModuleSector.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "escritorio-a", moduleCode: TELA } });
    expect(gravados()).toEqual(["contabil"]);
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "module.share", entityId: TELA, metadata: { sector: "contabil", owner: "fiscal" } })
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("soma ao que já estava, e tirar devolve o resto", async () => {
    m.db.tenantModuleSector.findMany.mockResolvedValue([{ moduleCode: TELA, sectorCode: "contabil" }]);
    await ligarModuloAoSetor(TELA, "bpo", true);
    expect(gravados()).toEqual(["contabil", "bpo"]);

    m.db.tenantModuleSector.findMany.mockResolvedValue([
      { moduleCode: TELA, sectorCode: "contabil" },
      { moduleCode: TELA, sectorCode: "bpo" },
    ]);
    await ligarModuloAoSetor(TELA, "contabil", false);
    expect(gravados()).toEqual(["bpo"]);
    expect(m.logAudit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "module.unshare" }));
  });

  it("o dono não entra na lista — ele mora em tenant_modules", async () => {
    await ligarModuloAoSetor(TELA, "fiscal", true);
    expect(m.db.tenantModuleSector.createMany).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("vale o dono do escritório: com a tela movida para o BPO, o Fiscal pode ser ligado", async () => {
    m.db.tenantModule.findUnique.mockResolvedValue({ sectorCode: "bpo" });
    await ligarModuloAoSetor(TELA, "fiscal", true);
    expect(gravados()).toEqual(["fiscal"]);
  });

  it("setor inventado (ou inativo) não entra — o valor vem do navegador", async () => {
    await ligarModuloAoSetor(TELA, "inventado", true);
    expect(m.db.tenantModuleSector.createMany).not.toHaveBeenCalled();
  });

  it("gestor de setor, usuário e só leitura não mexem", async () => {
    for (const role of ["SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as UserRole[]) {
      m.ctx.role = role;
      await ligarModuloAoSetor(TELA, "contabil", true);
    }
    expect(m.db.tenantModuleSector.createMany).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("telas do menu Geral e código fora do catálogo ficam de fora", async () => {
    await ligarModuloAoSetor("arquivos", "contabil", true);
    await ligarModuloAoSetor("nao_existe", "contabil", true);
    expect(m.db.tenantModuleSector.createMany).not.toHaveBeenCalled();
  });

  it("sem a tabela (deploy antes da migration), nada é gravado nem registrado", async () => {
    m.db.tenantModuleSector.findMany.mockRejectedValue(Object.assign(new Error("The table `tenant_module_sectors` does not exist"), { code: "P2021" }));
    await ligarModuloAoSetor(TELA, "contabil", true);
    expect(m.db.tenantModuleSector.createMany).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });
});

describe("transferirModulo com setores a mais", () => {
  it("mover para um setor que já estava em \"Também em…\" tira ele da lista", async () => {
    m.db.tenantModuleSector.findMany.mockResolvedValue([
      { moduleCode: TELA, sectorCode: "contabil" },
      { moduleCode: TELA, sectorCode: "bpo" },
    ]);
    await transferirModulo(TELA, "bpo");
    expect(m.db.tenantModule.upsert).toHaveBeenCalled();
    expect(gravados()).toEqual(["contabil"]);
  });

  it("mover para um setor fora da lista não mexe nos setores a mais", async () => {
    m.db.tenantModuleSector.findMany.mockResolvedValue([{ moduleCode: TELA, sectorCode: "contabil" }]);
    await transferirModulo(TELA, "bpo");
    expect(m.db.tenantModuleSector.createMany).not.toHaveBeenCalled();
  });
});

describe("setoresDoModulo", () => {
  it("o dono primeiro, depois os ligados", async () => {
    m.db.tenantModuleSector.findMany.mockResolvedValue([
      { moduleCode: TELA, sectorCode: "contabil" },
      { moduleCode: TELA, sectorCode: "bpo" },
    ]);
    expect(await setoresDoModulo("escritorio-a", TELA)).toEqual(["fiscal", "contabil", "bpo"]);
  });

  it("sem a tabela, a tela fica só no dono — ninguém ganha nem perde acesso", async () => {
    m.db.tenantModuleSector.findMany.mockRejectedValue(new Error("The table `tenant_module_sectors` does not exist"));
    expect(await setoresDoModulo("escritorio-a", TELA)).toEqual(["fiscal"]);
  });

  it("módulo fora do catálogo não tem setor", async () => {
    expect(await setoresDoModulo("escritorio-a", "nao_existe")).toBeNull();
  });
});
