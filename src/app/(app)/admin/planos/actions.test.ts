import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// "Editar plano" e "Mostrar preços no site" (14/10/2026): só o Super Admin;
// nome, valor e implantação nas colunas do plano, o que vai para o site na
// tabela nova; cada mudança na Auditoria, e nada gravado quando nada muda.

const m = vi.hoisted(() => ({
  db: {
    subscriptionPlan: { findUnique: vi.fn(), update: vi.fn() },
    planoNoSite: { findUnique: vi.fn(), upsert: vi.fn() },
    configuracaoDoConnect: { upsert: vi.fn() },
  },
  ctx: { tenantId: "t-41", userId: "kauan", role: "SUPER_ADMIN" as UserRole },
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

const { editarPlano, definirPrecosNoSite } = await import("./actions");

const semTabela = () => Object.assign(new Error("The table `planos_no_site` does not exist"), { code: "P2021" });

const PLANO = {
  id: "p-ger",
  name: "Gerenciado",
  managementMode: "MANAGED",
  billingType: "FLAT_MONTHLY",
  basePrice: "1500",
  pricePerUser: null,
  setupFee: "3000",
};

function form(campos: Record<string, string | string[]>) {
  const f = new FormData();
  f.set("planId", "p-ger");
  for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) f.append(k, x);
  return f;
}

const SEM_MUDAR = { name: "Gerenciado", valor: "1.500,00", setupFee: "3000" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.ctx = { tenantId: "t-41", userId: "kauan", role: "SUPER_ADMIN" };
  m.db.subscriptionPlan.findUnique.mockResolvedValue(PLANO);
  m.db.subscriptionPlan.update.mockResolvedValue({});
  m.db.planoNoSite.findUnique.mockResolvedValue(null);
  m.db.planoNoSite.upsert.mockResolvedValue({});
  m.db.configuracaoDoConnect.upsert.mockResolvedValue({});
});

describe("editarPlano: quem pode", () => {
  it.each(["ADMIN", "SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as UserRole[])("%s não edita: nada grava", async (role) => {
    m.ctx.role = role;
    expect(await editarPlano(null, form({ ...SEM_MUDAR, name: "Outro" }))).toEqual({ error: "Sem permissão." });
    expect(m.db.subscriptionPlan.findUnique).not.toHaveBeenCalled();
    expect(m.db.subscriptionPlan.update).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("plano que não existe", async () => {
    m.db.subscriptionPlan.findUnique.mockResolvedValue(null);
    expect(await editarPlano(null, form(SEM_MUDAR))).toEqual({ error: "Plano não encontrado." });
  });
});

describe("editarPlano: o plano", () => {
  it("grava nome, valor mensal e implantação, e audita o de → para", async () => {
    expect(await editarPlano(null, form({ name: " Gerenciado Plus ", valor: "1.800,50", setupFee: "R$ 2.500" }))).toBeNull();
    expect(m.db.subscriptionPlan.update).toHaveBeenCalledWith({
      where: { id: "p-ger" },
      data: { name: "Gerenciado Plus", basePrice: "1800.50", setupFee: "2500.00" },
    });
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "subscription_plan.update",
        entityType: "SubscriptionPlan",
        entityId: "p-ger",
        metadata: { name: "Gerenciado → Gerenciado Plus", basePrice: "1500.00 → 1800.50", setupFee: "3000.00 → 2500.00" },
      }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("no plano por usuário, o valor vai para o valor por usuário, que não pode ser zero", async () => {
    m.db.subscriptionPlan.findUnique.mockResolvedValue({ ...PLANO, billingType: "PER_USER_MONTHLY", pricePerUser: "89.9", basePrice: "0" });
    expect(await editarPlano(null, form({ name: "Gerenciado", valor: "0", setupFee: "" }))).toEqual({
      error: "O valor por usuário precisa ser maior que zero.",
    });
    expect(await editarPlano(null, form({ name: "Gerenciado", valor: "99,90", setupFee: "3000" }))).toBeNull();
    expect(m.db.subscriptionPlan.update).toHaveBeenCalledWith({ where: { id: "p-ger" }, data: { name: "Gerenciado", pricePerUser: "99.90", setupFee: "3000.00" } });
  });

  it.each([
    [{ ...SEM_MUDAR, name: "  " }, "O nome do plano é obrigatório."],
    [{ ...SEM_MUDAR, name: "x".repeat(81) }, "O nome do plano tem no máximo 80 letras."],
    [{ ...SEM_MUDAR, valor: "" }, "Informe o valor mensal."],
    [{ ...SEM_MUDAR, valor: "mil" }, "O valor mensal não é um valor válido."],
    [{ ...SEM_MUDAR, valor: "-10" }, "O valor mensal não é um valor válido."],
    [{ ...SEM_MUDAR, valor: "10,555" }, "O valor mensal não é um valor válido."],
    [{ ...SEM_MUDAR, setupFee: "abc" }, "A taxa de implantação não é um valor válido."],
    [{ ...SEM_MUDAR, valor: "100000000" }, "O valor mensal não é um valor válido."],
  ])("recusa %j", async (campos, erro) => {
    expect(await editarPlano(null, form(campos))).toEqual({ error: erro });
    expect(m.db.subscriptionPlan.update).not.toHaveBeenCalled();
  });

  it("sem mudança, não grava nem audita", async () => {
    expect(await editarPlano(null, form(SEM_MUDAR))).toBeNull();
    expect(m.db.subscriptionPlan.update).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });
});

describe("editarPlano: no site", () => {
  const SITE = { comSite: "1", mostrarNoSite: "on", ordem: "1", paraQuem: "Para quem quer tudo pronto", destaque: ["A 41 Tech cuida", ""] };

  it("grava a linha do site e audita", async () => {
    expect(await editarPlano(null, form({ ...SEM_MUDAR, ...SITE }))).toBeNull();
    const campos = { mostrarNoSite: true, ordem: 1, destacar: false, paraQuem: "Para quem quer tudo pronto", destaques: ["A 41 Tech cuida"] };
    expect(m.db.planoNoSite.upsert).toHaveBeenCalledWith({ where: { planId: "p-ger" }, create: { planId: "p-ger", ...campos }, update: campos });
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "subscription_plan.site.update", metadata: { mostrarNoSite: true, ordem: 1, destacar: false } }),
    );
  });

  it("igual ao que já está guardado: nada grava", async () => {
    m.db.planoNoSite.findUnique.mockResolvedValue({
      planId: "p-ger",
      mostrarNoSite: true,
      ordem: 1,
      destacar: false,
      paraQuem: "Para quem quer tudo pronto",
      destaques: ["A 41 Tech cuida"],
    });
    expect(await editarPlano(null, form({ ...SEM_MUDAR, ...SITE }))).toBeNull();
    expect(m.db.planoNoSite.upsert).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("sem os campos do site na janela (tabela que não existe), não toca na tabela", async () => {
    expect(await editarPlano(null, form({ ...SEM_MUDAR, name: "Novo nome" }))).toBeNull();
    expect(m.db.planoNoSite.findUnique).not.toHaveBeenCalled();
    expect(m.db.subscriptionPlan.update).toHaveBeenCalled();
  });

  it("campo do site inválido: nada grava, nem o plano", async () => {
    expect(await editarPlano(null, form({ ...SEM_MUDAR, name: "Novo nome", ...SITE, ordem: "500" }))).toEqual({
      error: "A ordem no site é um número de 1 a 99.",
    });
    expect(m.db.subscriptionPlan.update).not.toHaveBeenCalled();
  });

  it("tabela do site sumida no meio do caminho: o plano fica salvo e a tela avisa", async () => {
    m.db.planoNoSite.findUnique.mockRejectedValue(semTabela());
    const r = await editarPlano(null, form({ ...SEM_MUDAR, name: "Novo nome", ...SITE }));
    expect(r?.error).toMatch(/falta a atualização do banco/);
    expect(m.db.subscriptionPlan.update).toHaveBeenCalled();
  });
});

describe("definirPrecosNoSite", () => {
  it("só o Super Admin", async () => {
    m.ctx.role = "ADMIN";
    expect(await definirPrecosNoSite(true)).toEqual({ erro: "Sem permissão." });
    expect(m.db.configuracaoDoConnect.upsert).not.toHaveBeenCalled();
  });

  it("liga e desliga, e audita cada troca", async () => {
    expect(await definirPrecosNoSite(true)).toEqual({ ok: true });
    expect(m.db.configuracaoDoConnect.upsert).toHaveBeenCalledWith({
      where: { chave: "site.mostrarPrecos" },
      create: { chave: "site.mostrarPrecos", valor: "true" },
      update: { valor: "true" },
    });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "site.prices.show" }));
    expect(await definirPrecosNoSite(false)).toEqual({ ok: true });
    expect(m.logAudit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "site.prices.hide" }));
    expect(m.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("pedido que não é sim ou não", async () => {
    expect(await definirPrecosNoSite("true" as unknown as boolean)).toEqual({ erro: "Pedido inválido." });
  });

  it("sem a tabela: avisa, sem auditar", async () => {
    m.db.configuracaoDoConnect.upsert.mockRejectedValue(semTabela());
    expect(await definirPrecosNoSite(true)).toEqual({ erro: "Falta a atualização do banco desta versão do Connect." });
    expect(m.logAudit).not.toHaveBeenCalled();
  });
});
