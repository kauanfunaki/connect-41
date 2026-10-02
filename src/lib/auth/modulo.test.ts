import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: vi.fn(), setorDoModulo: vi.fn() }));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...original, getAuthContext: vi.fn() };
});

import { alcancaModulo } from "./modulo";
import type { AuthContext } from "./context";

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

describe("alcancaModulo", () => {
  it("quem é só do BPO não vê nem grava no DP — o achado de 30/09", () => {
    const doBpo = ctx({ role: "SECTOR_ADMIN", sectors: ["bpo"] });
    expect(alcancaModulo(doBpo, "dp", true, "ver")).toBe(false);
    expect(alcancaModulo(doBpo, "dp", true, "agir")).toBe(false);
    // Antes, `canWrite(role)` deixava qualquer coordenador gravar férias.
    expect(alcancaModulo(doBpo, "dp", true, "gerir")).toBe(false);
  });

  it("quem é do DP vê e age; só o coordenador do DP gere", () => {
    const usuario = ctx({ role: "SECTOR_USER", sectors: ["dp"] });
    const coordenador = ctx({ role: "SECTOR_ADMIN", sectors: ["dp"] });
    expect(alcancaModulo(usuario, "dp", true, "ver")).toBe(true);
    expect(alcancaModulo(usuario, "dp", true, "agir")).toBe(true);
    expect(alcancaModulo(usuario, "dp", true, "gerir")).toBe(false);
    expect(alcancaModulo(coordenador, "dp", true, "gerir")).toBe(true);
  });

  it("administrador alcança tudo; leitura geral só vê", () => {
    const admin = ctx({ role: "ADMIN" });
    const leitura = ctx({ role: "READONLY" });
    expect(alcancaModulo(admin, "dp", true, "gerir")).toBe(true);
    expect(alcancaModulo(leitura, "dp", true, "ver")).toBe(true);
    expect(alcancaModulo(leitura, "dp", true, "agir")).toBe(false);
  });

  it("módulo desligado fecha para todos, administrador inclusive", () => {
    expect(alcancaModulo(ctx({ role: "ADMIN" }), "dp", false, "ver")).toBe(false);
    expect(alcancaModulo(ctx({ role: "SECTOR_ADMIN", sectors: ["dp"] }), "dp", false, "ver")).toBe(false);
  });

  it("assinatura vencida deixa ver, mas não gravar", () => {
    const vencido = ctx({ role: "SECTOR_ADMIN", sectors: ["dp"], subscriptionReadOnly: true });
    expect(alcancaModulo(vencido, "dp", true, "ver")).toBe(true);
    expect(alcancaModulo(vencido, "dp", true, "agir")).toBe(false);
    expect(alcancaModulo(vencido, "dp", true, "gerir")).toBe(false);
  });

  it("vale o setor que opera o módulo no escritório, não o do catálogo", () => {
    // Escritório que pôs o DP para ser operado pelo Recrutamento.
    const doRecrutamento = ctx({ role: "SECTOR_USER", sectors: ["recrutamento"] });
    expect(alcancaModulo(doRecrutamento, "recrutamento", true, "ver")).toBe(true);
    expect(alcancaModulo(doRecrutamento, "dp", true, "ver")).toBe(false);
  });
});
