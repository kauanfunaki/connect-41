import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { FALTA_ATUALIZAR_O_BANCO } from "@/lib/portal/telasLiberadas";

// Telas liberadas no portal (14/10/2026): só Administrador e Super Admin
// liberam ou bloqueiam; vale sempre para o escritório de quem pede; só telas
// do catálogo, nunca o Início; cada troca vai para a auditoria.

const m = vi.hoisted(() => ({
  db: { portalTelaBloqueada: { upsert: vi.fn(), deleteMany: vi.fn() } },
  ctx: { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN" as UserRole, subscriptionReadOnly: false },
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const { definirTelaDoPortal } = await import("./telas-actions");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.ctx = { tenantId: "escritorio-a", userId: "admin-1", role: "ADMIN", subscriptionReadOnly: false };
  m.db.portalTelaBloqueada.upsert.mockResolvedValue({});
  m.db.portalTelaBloqueada.deleteMany.mockResolvedValue({ count: 1 });
});

describe("quem pode", () => {
  it.each(["ADMIN", "SUPER_ADMIN"] as UserRole[])("%s bloqueia e libera", async (role) => {
    m.ctx.role = role;
    expect(await definirTelaDoPortal("/portal/dre", false)).toEqual({ ok: true });
    expect(await definirTelaDoPortal("/portal/dre", true)).toEqual({ ok: true });
    expect(m.db.portalTelaBloqueada.upsert).toHaveBeenCalledTimes(1);
    expect(m.db.portalTelaBloqueada.deleteMany).toHaveBeenCalledTimes(1);
  });

  it.each(["SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as UserRole[])("%s não: nada grava, nada vai para a auditoria", async (role) => {
    m.ctx.role = role;
    expect(await definirTelaDoPortal("/portal/dre", false)).toEqual({
      erro: "Só o Administrador ou o Super Admin libera ou bloqueia telas do portal.",
    });
    expect(m.db.portalTelaBloqueada.upsert).not.toHaveBeenCalled();
    expect(m.db.portalTelaBloqueada.deleteMany).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("assinatura em somente leitura: nem o administrador", async () => {
    m.ctx.subscriptionReadOnly = true;
    expect(await definirTelaDoPortal("/portal/dre", false)).toHaveProperty("erro");
    expect(m.db.portalTelaBloqueada.upsert).not.toHaveBeenCalled();
  });
});

describe("o que grava", () => {
  it("bloquear grava a linha no escritório de quem pede, e audita", async () => {
    expect(await definirTelaDoPortal("/portal/pendencias", false)).toEqual({ ok: true });
    expect(m.db.portalTelaBloqueada.upsert).toHaveBeenCalledWith({
      where: { tenantId_href: { tenantId: "escritorio-a", href: "/portal/pendencias" } },
      create: { tenantId: "escritorio-a", href: "/portal/pendencias" },
      update: {},
    });
    expect(m.logAudit).toHaveBeenCalledWith({
      tenantId: "escritorio-a",
      userId: "admin-1",
      action: "portal.tela.bloqueada",
      entityType: "PortalTelaBloqueada",
      entityId: "/portal/pendencias",
      metadata: { tela: "Pendências", endereco: "/portal/pendencias" },
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/portal");
  });

  it("liberar apaga só a linha do escritório de quem pede, e audita", async () => {
    expect(await definirTelaDoPortal("/portal/pendencias", true)).toEqual({ ok: true });
    expect(m.db.portalTelaBloqueada.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "escritorio-a", href: "/portal/pendencias" } });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "escritorio-a", action: "portal.tela.liberada" }));
  });

  it("outro escritório: a mesma tela vai para a linha dele, nunca para a do primeiro", async () => {
    m.ctx.tenantId = "escritorio-b";
    await definirTelaDoPortal("/portal/dre", false);
    await definirTelaDoPortal("/portal/dre", true);
    expect(m.db.portalTelaBloqueada.upsert.mock.calls[0]![0].create.tenantId).toBe("escritorio-b");
    expect(m.db.portalTelaBloqueada.deleteMany.mock.calls[0]![0].where.tenantId).toBe("escritorio-b");
  });

  it.each(["/portal", "/portal/conta", "/portal/ajuda"])("%s nunca se bloqueia", async (href) => {
    expect(await definirTelaDoPortal(href, false)).toHaveProperty("erro");
    expect(m.db.portalTelaBloqueada.upsert).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("endereço fora do catálogo não grava", async () => {
    expect(await definirTelaDoPortal("/portal/inventada", false)).toEqual({ erro: "Tela não encontrada." });
    expect(await definirTelaDoPortal(42 as unknown as string, false)).toEqual({ erro: "Tela não encontrada." });
    expect(await definirTelaDoPortal("/portal/dre", "sim" as unknown as boolean)).toEqual({ erro: "Tela não encontrada." });
    expect(m.db.portalTelaBloqueada.upsert).not.toHaveBeenCalled();
    expect(m.db.portalTelaBloqueada.deleteMany).not.toHaveBeenCalled();
  });
});

describe("banco", () => {
  it("sem a tabela (migration que não rodou): diz o que falta, sem auditar", async () => {
    m.db.portalTelaBloqueada.upsert.mockRejectedValueOnce(Object.assign(new Error("sem tabela"), { code: "P2021" }));
    expect(await definirTelaDoPortal("/portal/dre", false)).toEqual({ erro: FALTA_ATUALIZAR_O_BANCO });
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("dois cliques bloqueando ao mesmo tempo: o segundo também dá certo", async () => {
    m.db.portalTelaBloqueada.upsert.mockRejectedValueOnce(Object.assign(new Error("duplicada"), { code: "P2002" }));
    expect(await definirTelaDoPortal("/portal/dre", false)).toEqual({ ok: true });
  });

  it("outro erro: mensagem para tentar de novo, sem auditar", async () => {
    m.db.portalTelaBloqueada.deleteMany.mockRejectedValueOnce(new Error("conexão"));
    expect(await definirTelaDoPortal("/portal/dre", true)).toEqual({ erro: "Não foi possível salvar agora. Tente de novo em instantes." });
    expect(m.logAudit).not.toHaveBeenCalled();
  });
});
