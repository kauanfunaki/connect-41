import { describe, it, expect } from "vitest";
import {
  isFullAccess,
  isFullWrite,
  canWrite,
  canAct,
  canManageSector,
  canActOnSector,
  canViewSector,
  scopedSectors,
  type AuthContext,
} from "./context";

function ctx(role: AuthContext["role"], sectors: string[] = [], subscriptionReadOnly = false): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly,
    canSelfRegularizeSubscription: true,
    activeSector: null,
  };
}

describe("predicados de papel", () => {
  it("isFullAccess: admins e readonly enxergam tudo", () => {
    expect(isFullAccess("SUPER_ADMIN")).toBe(true);
    expect(isFullAccess("ADMIN")).toBe(true);
    expect(isFullAccess("READONLY")).toBe(true);
    expect(isFullAccess("SECTOR_ADMIN")).toBe(false);
    expect(isFullAccess("SECTOR_USER")).toBe(false);
  });

  it("isFullWrite: só SUPER_ADMIN e ADMIN", () => {
    expect(isFullWrite("SUPER_ADMIN")).toBe(true);
    expect(isFullWrite("ADMIN")).toBe(true);
    expect(isFullWrite("READONLY")).toBe(false);
  });

  it("canWrite inclui SECTOR_ADMIN, exclui READONLY e SECTOR_USER", () => {
    expect(canWrite("SECTOR_ADMIN")).toBe(true);
    expect(canWrite("SECTOR_USER")).toBe(false);
    expect(canWrite("READONLY")).toBe(false);
  });

  it("canAct exclui apenas READONLY", () => {
    expect(canAct("SECTOR_USER")).toBe(true);
    expect(canAct("READONLY")).toBe(false);
  });
});

describe("predicados por setor", () => {
  it("canManageSector: admin do tenant sempre; sector_admin só no próprio setor", () => {
    expect(canManageSector(ctx("ADMIN"), "fiscal")).toBe(true);
    expect(canManageSector(ctx("SECTOR_ADMIN", ["dp"]), "dp")).toBe(true);
    expect(canManageSector(ctx("SECTOR_ADMIN", ["dp"]), "fiscal")).toBe(false);
    expect(canManageSector(ctx("READONLY"), "dp")).toBe(false);
  });

  it("canActOnSector: full access age em qualquer setor (menos readonly)", () => {
    expect(canActOnSector(ctx("ADMIN"), "fiscal")).toBe(true);
    expect(canActOnSector(ctx("READONLY"), "fiscal")).toBe(false);
    expect(canActOnSector(ctx("SECTOR_USER", ["dp"]), "dp")).toBe(true);
    expect(canActOnSector(ctx("SECTOR_USER", ["dp"]), "fiscal")).toBe(false);
  });

  it("canViewSector: full access vê tudo; demais só setores atribuídos", () => {
    expect(canViewSector(ctx("READONLY"), "fiscal")).toBe(true);
    expect(canViewSector(ctx("SECTOR_USER", ["dp"]), "dp")).toBe(true);
    expect(canViewSector(ctx("SECTOR_USER", ["dp"]), "fiscal")).toBe(false);
  });

  it("subscriptionReadOnly bloqueia canActOnSector/canManageSector mesmo pra admin", () => {
    expect(canActOnSector(ctx("ADMIN", [], true), "fiscal")).toBe(false);
    expect(canManageSector(ctx("ADMIN", [], true), "fiscal")).toBe(false);
    expect(canActOnSector(ctx("ADMIN", [], false), "fiscal")).toBe(true);
  });
});

// ── Setor ativo é filtro de visão, NUNCA permissão ────────────────────────────
// Se algum dia alguém fizer canActOnSector olhar ctx.activeSector, quem tem dois
// setores passa a receber "sem permissão" ao trocar o seletor. Estes testes
// existem para essa mudança não passar em silêncio.
describe("setor ativo não afeta permissão", () => {
  function comSetorAtivo(base: AuthContext, activeSector: string | null): AuthContext {
    return { ...base, activeSector };
  }

  it("canActOnSector ignora o setor ativo", () => {
    const base = ctx("SECTOR_USER", ["bpo", "fiscal"]);
    for (const ativo of [null, "bpo", "fiscal"]) {
      const c = comSetorAtivo(base, ativo);
      expect(canActOnSector(c, "bpo")).toBe(true);
      expect(canActOnSector(c, "fiscal")).toBe(true);
      expect(canActOnSector(c, "contabil")).toBe(false);
    }
  });

  it("canViewSector ignora o setor ativo", () => {
    const base = ctx("SECTOR_USER", ["bpo", "fiscal"]);
    for (const ativo of [null, "bpo", "fiscal"]) {
      const c = comSetorAtivo(base, ativo);
      expect(canViewSector(c, "fiscal")).toBe(true);
    }
  });

  it("canManageSector ignora o setor ativo", () => {
    const base = ctx("SECTOR_ADMIN", ["bpo", "fiscal"]);
    for (const ativo of [null, "bpo", "fiscal"]) {
      const c = comSetorAtivo(base, ativo);
      expect(canManageSector(c, "fiscal")).toBe(true);
    }
  });
});

describe("scopedSectors", () => {
  it("setor ativo restringe a leitura", () => {
    expect(scopedSectors({ ...ctx("SECTOR_USER", ["bpo", "fiscal"]), activeSector: "bpo" })).toEqual(["bpo"]);
  });

  it("Todos, sem full access, é a união dos setores da pessoa", () => {
    expect(scopedSectors(ctx("SECTOR_USER", ["bpo", "fiscal"]))).toEqual(["bpo", "fiscal"]);
  });

  it("Todos, com full access, é sem filtro", () => {
    expect(scopedSectors(ctx("ADMIN"))).toBeNull();
  });
});
