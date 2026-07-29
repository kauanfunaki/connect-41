import { describe, it, expect } from "vitest";
import { canWriteEntity } from "./policy";
import type { AuthContext } from "./context";

function ctx(role: AuthContext["role"], subscriptionReadOnly = false): AuthContext {
  return { userId: "u1", tenantId: "t1", homeTenantId: "t1", role, sectors: [], subscriptionReadOnly };
}

describe("canWriteEntity", () => {
  it("segue canWrite(role) quando a assinatura não está read-only", () => {
    expect(canWriteEntity(ctx("SUPER_ADMIN"))).toBe(true);
    expect(canWriteEntity(ctx("SECTOR_ADMIN"))).toBe(true);
    expect(canWriteEntity(ctx("SECTOR_USER"))).toBe(false);
    expect(canWriteEntity(ctx("READONLY"))).toBe(false);
  });

  it("subscriptionReadOnly bloqueia mesmo SUPER_ADMIN/ADMIN", () => {
    expect(canWriteEntity(ctx("SUPER_ADMIN", true))).toBe(false);
    expect(canWriteEntity(ctx("ADMIN", true))).toBe(false);
    expect(canWriteEntity(ctx("SECTOR_ADMIN", true))).toBe(false);
  });
});
