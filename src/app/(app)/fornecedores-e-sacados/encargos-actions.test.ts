import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// Juros e multa pelo atraso (22/10/2026): a regra da empresa (aba "Juros e
// multa") e a da ficha do fornecedor ou cliente. Sessão, módulos, foco e banco
// simulados; a leitura do formulário é a real.

const estado = vi.hoisted(() => ({
  ctx: null as unknown as AuthContext,
  foraDoFoco: null as string | null,
  empresaAtualizada: [] as { where: unknown; data: Record<string, unknown> }[],
  contraparteAtualizada: [] as { where: unknown; data: Record<string, unknown> }[],
  contraparteCriada: [] as Record<string, unknown>[],
  auditoria: [] as { action: string; entityType: string; metadata?: Record<string, unknown> }[],
  regraDaContraparte: { lateFinePercent: null as string | null, lateInterestPercent: null as string | null, earlyDiscountPercent: null as string | null },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/context", async (original) => ({
  ...(await original<typeof import("@/lib/auth/context")>()),
  getAuthContext: async () => estado.ctx,
}));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true, setoresDoModulo: async () => ["bpo"] }));
vi.mock("@/lib/empresas/focoServidor", () => ({ recusaDoFoco: async () => estado.foraDoFoco }));
vi.mock("@/lib/audit", () => ({
  logAudit: async (a: { action: string; entityType: string; metadata?: Record<string, unknown> }) => {
    estado.auditoria.push(a);
  },
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    company: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => (where.tenantId === "t1" && where.id === "c1" ? { id: "c1" } : null),
      findUnique: async () => ({ lateFinePercent: "2.0000", lateInterestPercent: null, earlyDiscountPercent: null }),
      update: async (a: { where: unknown; data: Record<string, unknown> }) => {
        estado.empresaAtualizada.push(a);
        return {};
      },
    },
    financeCounterparty: {
      findFirst: async ({ where }: { where: { id?: string; tenantId: string; document?: string } }) => {
        if (where.document) return null;
        if (where.id !== "cp1" || where.tenantId !== "t1") return null;
        return {
          id: "cp1",
          companyId: "c1",
          document: "12345678000190",
          defaultCostCenterId: null,
          tradeName: null,
          phone: null,
          zipCode: null,
          addressStreet: null,
          addressNumber: null,
          addressComplement: null,
          neighborhood: null,
          city: null,
          stateCode: null,
          bankCode: null,
          bankAgency: null,
          bankAccount: null,
          pixKey: null,
          ...estado.regraDaContraparte,
        };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        estado.contraparteCriada.push(data);
        return { id: "nova" };
      },
      update: async (a: { where: unknown; data: Record<string, unknown> }) => {
        estado.contraparteAtualizada.push(a);
        return {};
      },
    },
  }),
}));

import { salvarEncargosDaEmpresa, atualizarContraparte, criarContraparte } from "./actions";

function ctx(role: AuthContext["role"], sectors: string[]): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
  };
}

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

beforeEach(() => {
  estado.ctx = ctx("SECTOR_USER", ["bpo"]);
  estado.foraDoFoco = null;
  estado.empresaAtualizada = [];
  estado.contraparteAtualizada = [];
  estado.contraparteCriada = [];
  estado.auditoria = [];
  estado.regraDaContraparte = { lateFinePercent: null, lateInterestPercent: null, earlyDiscountPercent: null };
});

describe("regra de juros e multa da empresa", () => {
  it("grava os percentuais nas colunas e registra o de-para na auditoria", async () => {
    expect(await salvarEncargosDaEmpresa(form({ companyId: "c1", multa: "2", juros: "1,5", desconto: "" }))).toEqual({ ok: true });
    expect(estado.empresaAtualizada).toEqual([
      { where: { id: "c1" }, data: { lateFinePercent: "2.0000", lateInterestPercent: "1.5000", earlyDiscountPercent: null } },
    ]);
    expect(estado.auditoria).toEqual([
      expect.objectContaining({
        action: "financeiro.encargos.empresa_salvos",
        entityType: "Company",
        metadata: { de: { multa: "2", juros: null, desconto: null }, para: { multa: "2", juros: "1.5", desconto: null } },
      }),
    ]);
  });

  it("os três vazios desligam a regra", async () => {
    await salvarEncargosDaEmpresa(form({ companyId: "c1", multa: "", juros: "", desconto: "" }));
    expect(estado.empresaAtualizada[0].data).toEqual({ lateFinePercent: null, lateInterestPercent: null, earlyDiscountPercent: null });
  });

  it("percentual inválido não grava", async () => {
    expect(await salvarEncargosDaEmpresa(form({ companyId: "c1", multa: "abc", juros: "", desconto: "" }))).toMatchObject({ error: expect.stringContaining("Multa") });
    expect(estado.empresaAtualizada).toEqual([]);
  });

  it("empresa de outro escritório, quem só vê ou fora do foco: não grava", async () => {
    expect(await salvarEncargosDaEmpresa(form({ companyId: "c9", multa: "2" }))).toEqual({ error: "Empresa não encontrada." });
    estado.ctx = ctx("READONLY", []);
    expect(await salvarEncargosDaEmpresa(form({ companyId: "c1", multa: "2" }))).toEqual({ error: "Sem permissão." });
    estado.ctx = ctx("SECTOR_USER", ["bpo"]);
    estado.foraDoFoco = "Fora do foco.";
    expect(await salvarEncargosDaEmpresa(form({ companyId: "c1", multa: "2" }))).toEqual({ error: "Fora do foco." });
    expect(estado.empresaAtualizada).toEqual([]);
  });
});

describe("regra própria na ficha do fornecedor ou cliente", () => {
  it("a edição grava a regra da ficha e diz na auditoria o que mudou", async () => {
    const r = await atualizarContraparte(form({ id: "cp1", nome: "Moinho", ativo: "1", encargosMulta: "0", encargosJuros: "2", encargosDesconto: "" }));
    expect(r).toEqual({ ok: true });
    expect(estado.contraparteAtualizada[0].data).toMatchObject({ lateFinePercent: "0.0000", lateInterestPercent: "2.0000", earlyDiscountPercent: null });
    expect(estado.auditoria[0]).toMatchObject({
      action: "financeiro.counterparty.updated",
      metadata: { jurosEMulta: { de: { multa: null, juros: null, desconto: null }, para: { multa: "0", juros: "2", desconto: null } } },
    });
  });

  it("sem mexer na regra, a auditoria não fala dela", async () => {
    estado.regraDaContraparte = { lateFinePercent: "2.0000", lateInterestPercent: null, earlyDiscountPercent: null };
    await atualizarContraparte(form({ id: "cp1", nome: "Moinho", ativo: "1", encargosMulta: "2", encargosJuros: "", encargosDesconto: "" }));
    expect(estado.auditoria[0].metadata).not.toHaveProperty("jurosEMulta");
  });

  it("percentual inválido na ficha recusa a edição inteira", async () => {
    expect(await atualizarContraparte(form({ id: "cp1", nome: "Moinho", encargosJuros: "150" }))).toMatchObject({ error: expect.stringContaining("Juros") });
    expect(estado.contraparteAtualizada).toEqual([]);
  });

  it("o cadastro novo já pode nascer com a regra; sem ela, as colunas ficam nulas", async () => {
    await criarContraparte(form({ companyId: "c1", nome: "Novo", encargosMulta: "2" }));
    await criarContraparte(form({ companyId: "c1", nome: "Outro" }));
    expect(estado.contraparteCriada[0]).toMatchObject({ lateFinePercent: "2.0000", lateInterestPercent: null, earlyDiscountPercent: null });
    expect(estado.contraparteCriada[1]).toMatchObject({ lateFinePercent: null, lateInterestPercent: null, earlyDiscountPercent: null });
  });
});
