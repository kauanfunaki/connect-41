import { describe, it, expect } from "vitest";
import {
  isFullAccess,
  isFullWrite,
  canWrite,
  canAct,
  canManageSector,
  canActOnSector,
  canViewSector,
  type AuthContext,
} from "./context";

function ctx(role: AuthContext["role"], sectors: string[] = []): AuthContext {
  return { userId: "u1", tenantId: "t1", homeTenantId: "t1", role, sectors };
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
    expect(canManageSector(ctx("SECTOR_ADMIN", ["dprh"]), "dprh")).toBe(true);
    expect(canManageSector(ctx("SECTOR_ADMIN", ["dprh"]), "fiscal")).toBe(false);
    expect(canManageSector(ctx("READONLY"), "dprh")).toBe(false);
  });

  it("canActOnSector: full access age em qualquer setor (menos readonly)", () => {
    expect(canActOnSector(ctx("ADMIN"), "fiscal")).toBe(true);
    expect(canActOnSector(ctx("READONLY"), "fiscal")).toBe(false);
    expect(canActOnSector(ctx("SECTOR_USER", ["dprh"]), "dprh")).toBe(true);
    expect(canActOnSector(ctx("SECTOR_USER", ["dprh"]), "fiscal")).toBe(false);
  });

  it("canViewSector: full access vê tudo; demais só setores atribuídos", () => {
    expect(canViewSector(ctx("READONLY"), "fiscal")).toBe(true);
    expect(canViewSector(ctx("SECTOR_USER", ["dprh"]), "dprh")).toBe(true);
    expect(canViewSector(ctx("SECTOR_USER", ["dprh"]), "fiscal")).toBe(false);
  });
});
