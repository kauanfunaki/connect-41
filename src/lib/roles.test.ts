import { describe, it, expect } from "vitest";
import { assignableRoles } from "./roles";

describe("assignableRoles", () => {
  it("SUPER_ADMIN pode atribuir qualquer papel, inclusive SUPER_ADMIN", () => {
    const roles = assignableRoles("SUPER_ADMIN");
    expect(roles).toContain("SUPER_ADMIN");
    expect(roles).toContain("ADMIN");
    expect(roles).toContain("READONLY");
  });

  it("ADMIN não pode atribuir SUPER_ADMIN (reservado a suporte 41 Tech)", () => {
    const roles = assignableRoles("ADMIN");
    expect(roles).not.toContain("SUPER_ADMIN");
    expect(roles).toContain("ADMIN");
    expect(roles).toContain("SECTOR_ADMIN");
  });
});
