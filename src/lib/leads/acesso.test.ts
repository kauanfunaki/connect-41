import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: vi.fn(), setorDoModulo: vi.fn() }));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...original, getAuthContext: vi.fn() };
});

import { alcancaModulo } from "@/lib/auth/modulo";
import type { AuthContext } from "@/lib/auth/context";
import { getModuleDef } from "@/lib/module-catalog";
import { MODULO_LEADS } from "./regras";

// As telas /leads e /leads/[id] passam pelo gate comum dos módulos
// (`abrirTelaDoModulo`, `podeNoModulo`). Aqui, os perfis de verdade contra o
// setor do Leads — a conta de quem testa é admin e vê tudo (05/10/2026).

function ctx(parcial: Partial<AuthContext>): AuthContext {
  return {
    userId: "u",
    tenantId: "t",
    homeTenantId: "t",
    role: "SECTOR_USER",
    sectors: [],
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: false,
    activeSector: null,
    ...parcial,
  } as AuthContext;
}

const COMERCIAL = getModuleDef(MODULO_LEADS)!.sectorCode;

describe("quem abre os leads", () => {
  it("o módulo nasce no Comercial", () => {
    expect(COMERCIAL).toBe("comercial");
  });

  it("quem é do Comercial vê e age; quem é de outro setor não vê", () => {
    expect(alcancaModulo(ctx({ sectors: ["comercial"] }), COMERCIAL, true, "ver")).toBe(true);
    expect(alcancaModulo(ctx({ sectors: ["comercial"] }), COMERCIAL, true, "agir")).toBe(true);
    expect(alcancaModulo(ctx({ sectors: ["bpo"] }), COMERCIAL, true, "ver")).toBe(false);
    expect(alcancaModulo(ctx({ sectors: ["bpo", "comercial"] }), COMERCIAL, true, "agir")).toBe(true);
  });

  it("diretoria (somente leitura) vê e não muda; administrador faz tudo", () => {
    expect(alcancaModulo(ctx({ role: "READONLY" }), COMERCIAL, true, "ver")).toBe(true);
    expect(alcancaModulo(ctx({ role: "READONLY" }), COMERCIAL, true, "agir")).toBe(false);
    expect(alcancaModulo(ctx({ role: "ADMIN" }), COMERCIAL, true, "agir")).toBe(true);
  });

  it("módulo desligado fecha a tela até para o administrador", () => {
    expect(alcancaModulo(ctx({ role: "ADMIN" }), COMERCIAL, false, "ver")).toBe(false);
  });

  it("assinatura em atraso deixa ver, mas não mudar", () => {
    expect(alcancaModulo(ctx({ sectors: ["comercial"], subscriptionReadOnly: true }), COMERCIAL, true, "ver")).toBe(true);
    expect(alcancaModulo(ctx({ sectors: ["comercial"], subscriptionReadOnly: true }), COMERCIAL, true, "agir")).toBe(false);
  });

  it("módulo transferido para outro setor sai do Comercial", () => {
    expect(alcancaModulo(ctx({ sectors: ["comercial"] }), "financeiro", true, "ver")).toBe(false);
    expect(alcancaModulo(ctx({ sectors: ["financeiro"] }), "financeiro", true, "agir")).toBe(true);
  });
});
