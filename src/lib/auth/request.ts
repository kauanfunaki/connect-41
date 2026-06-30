import { NextRequest } from "next/server";
import type { UserRole } from "@/generated/prisma/enums";
import type { AccessTokenPayload } from "./types";

export function getRequestUser(req: NextRequest): AccessTokenPayload {
  return {
    sub: req.headers.get("x-user-id")!,
    tenantId: req.headers.get("x-tenant-id")!,
    role: req.headers.get("x-user-role") as UserRole,
    sectors: req.headers.get("x-user-sectors")?.split(",").filter(Boolean) ?? [],
  };
}

export function requireRole(user: AccessTokenPayload, ...roles: UserRole[]): boolean {
  return roles.includes(user.role);
}

export function requireSector(user: AccessTokenPayload, sectorCode: string): boolean {
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "READONLY") {
    return true;
  }
  return user.sectors.includes(sectorCode);
}
