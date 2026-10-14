import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// O que se testa: as actions do menu Geral por setor (14/10/2026). Só
// Administrador e Super Admin gravam, fora da assinatura em somente leitura; o
// setor é conferido no escritório de quem pede; cada troca vai para a trilha
// de auditoria; erro de banco (a tabela ainda não existir, inclusive) volta
// como mensagem, sem lançar e sem registrar o que não aconteceu.

const m = vi.hoisted(() => {
  const db = {
    sector: { findFirst: vi.fn() },
    sectorMenuView: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
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

const { alternarTelaDoGeral, restaurarMenuGeral } = await import("./menu-geral-actions");

const RECRUTAMENTO = { id: "setor-rec", code: "recrutamento", label: "Recrutamento" };
const CHAVE = { tenantId_sectorCode: { tenantId: "escritorio-a", sectorCode: "recrutamento" } };
const semTabela = () => Object.assign(new Error("The table `sector_menu_views` does not exist"), { code: "P2021" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.ctx.role = "ADMIN";
  m.ctx.subscriptionReadOnly = false;
  m.db.sector.findFirst.mockResolvedValue(RECRUTAMENTO);
  m.db.sectorMenuView.findUnique.mockResolvedValue(null);
  m.db.sectorMenuView.upsert.mockResolvedValue({});
  m.db.sectorMenuView.deleteMany.mockResolvedValue({ count: 1 });
});

describe("alternarTelaDoGeral", () => {
  it("esconde: grava a lista, registra na auditoria e atualiza o menu", async () => {
    expect(await alternarTelaDoGeral("setor-rec", "solicitacoes", false)).toBeNull();
    expect(m.db.sector.findFirst).toHaveBeenCalledWith({
      where: { id: "setor-rec", tenantId: "escritorio-a" },
      select: { id: true, code: true, label: true },
    });
    expect(m.db.sectorMenuView.upsert).toHaveBeenCalledWith({
      where: CHAVE,
      create: { tenantId: "escritorio-a", sectorCode: "recrutamento", hiddenScreens: '["solicitacoes"]' },
      update: { hiddenScreens: '["solicitacoes"]' },
    });
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "escritorio-a",
        userId: "admin-1",
        action: "sector.menu.hide",
        entityType: "Sector",
        entityId: "setor-rec",
        metadata: { setor: "Recrutamento", tela: "Solicitações" },
      }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("mostra: tira da lista o que já estava escondido, e mantém o resto", async () => {
    m.db.sectorMenuView.findUnique.mockResolvedValue({ hiddenScreens: '["transferencias","solicitacoes"]' });
    expect(await alternarTelaDoGeral("setor-rec", "solicitacoes", true)).toBeNull();
    expect(m.db.sectorMenuView.upsert.mock.calls[0]![0].update).toEqual({ hiddenScreens: '["transferencias"]' });
    expect(m.logAudit.mock.calls[0]![0].action).toBe("sector.menu.show");
  });

  it("o Super Admin também configura", async () => {
    m.ctx.role = "SUPER_ADMIN";
    expect(await alternarTelaDoGeral("setor-rec", "agenda", false)).toBeNull();
    expect(m.db.sectorMenuView.upsert).toHaveBeenCalled();
  });

  for (const role of ["SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as UserRole[]) {
    it(`${role} não configura — nem chega ao banco`, async () => {
      m.ctx.role = role;
      expect(await alternarTelaDoGeral("setor-rec", "solicitacoes", false)).toEqual({ error: expect.stringContaining("Administrador") });
      expect(m.db.sector.findFirst).not.toHaveBeenCalled();
      expect(m.db.sectorMenuView.upsert).not.toHaveBeenCalled();
      expect(m.logAudit).not.toHaveBeenCalled();
    });
  }

  it("assinatura em somente leitura bloqueia", async () => {
    m.ctx.subscriptionReadOnly = true;
    expect(await alternarTelaDoGeral("setor-rec", "solicitacoes", false)).toHaveProperty("error");
    expect(m.db.sectorMenuView.upsert).not.toHaveBeenCalled();
  });

  it("tela desconhecida — Início e Meu dia inclusive — é recusada", async () => {
    for (const tela of ["inicio", "meu-dia", "conversas", ""]) {
      expect(await alternarTelaDoGeral("setor-rec", tela, false)).toEqual({ error: "Tela desconhecida." });
    }
    expect(m.db.sectorMenuView.upsert).not.toHaveBeenCalled();
  });

  it("setor de outro escritório (ou que não existe) é recusado", async () => {
    m.db.sector.findFirst.mockResolvedValue(null);
    expect(await alternarTelaDoGeral("setor-de-outro", "solicitacoes", false)).toEqual({ error: "Setor não encontrado neste escritório." });
    expect(m.db.sectorMenuView.upsert).not.toHaveBeenCalled();
  });

  it("sem a tabela: devolve o erro, sem lançar e sem registrar na auditoria", async () => {
    m.db.sectorMenuView.findUnique.mockRejectedValue(semTabela());
    expect(await alternarTelaDoGeral("setor-rec", "solicitacoes", false)).toHaveProperty("error");
    expect(m.logAudit).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("restaurarMenuGeral", () => {
  it("apaga a linha do setor (todas voltam) e registra", async () => {
    expect(await restaurarMenuGeral("setor-rec")).toBeNull();
    expect(m.db.sectorMenuView.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "escritorio-a", sectorCode: "recrutamento" } });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "sector.menu.reset", entityId: "setor-rec" }));
    expect(m.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("gestor do setor não restaura", async () => {
    m.ctx.role = "SECTOR_ADMIN";
    expect(await restaurarMenuGeral("setor-rec")).toHaveProperty("error");
    expect(m.db.sectorMenuView.deleteMany).not.toHaveBeenCalled();
  });

  it("sem a tabela: devolve o erro, sem lançar", async () => {
    m.db.sectorMenuView.deleteMany.mockRejectedValue(semTabela());
    expect(await restaurarMenuGeral("setor-rec")).toHaveProperty("error");
    expect(m.logAudit).not.toHaveBeenCalled();
  });
});
