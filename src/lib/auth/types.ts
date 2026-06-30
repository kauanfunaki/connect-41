import type { UserRole } from "@/generated/prisma/enums";

export interface AccessTokenPayload {
  sub: string;        // User.id
  tenantId: string;
  role: UserRole;
  sectors: string[];  // sectorCode[]
}

export interface RefreshTokenPayload {
  sub: string;        // User.id
  jti: string;        // RefreshToken.id (para revogação)
}
