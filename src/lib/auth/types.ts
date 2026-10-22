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

/**
 * Sessão de um CLIENTE no portal.
 *
 * `kind` não é decoração: é o que impede um token de virar o outro. O
 * verificador interno recusa payload com `kind: "portal"`, e o do portal exige
 * que ele esteja lá. Mesmo segredo, mesmo algoritmo — separação por conteúdo
 * declarado, conferida nos dois sentidos.
 */
export interface PortalAccessTokenPayload {
  kind: "portal";
  sub: string;          // PortalUser.id
  tenantId: string;
  // `clientGroupId` saiu do tipo em 21/10/2026 (etapa 3 da saída do Cliente).
  // Os tokens "lembrar" emitidos até 14/10/2026 ainda o trazem, e ele segue
  // ignorado: as empresas saem da ligação da conta, no banco (`alcanceDoCliente`).
}

export interface RefreshTokenPayload {
  sub: string;        // User.id
  jti: string;        // RefreshToken.id (para revogação)
}
