import type { UserRole } from "@/generated/prisma/enums";

export interface AccessTokenPayload {
  sub: string;        // User.id
  tenantId: string;   // tenant "titular" da conta — nunca muda
  role: UserRole;
  sectors: string[];  // sectorCode[]
  // Tenants extras que este usuário pode visualizar (só populado para SUPER_ADMIN).
  // Usado pelo middleware para validar a troca de workspace sem acesso a banco (Edge runtime).
  accessibleTenants?: string[];
}

export interface RefreshTokenPayload {
  sub: string;        // User.id
  jti: string;        // RefreshToken.id (para revogação)
}
