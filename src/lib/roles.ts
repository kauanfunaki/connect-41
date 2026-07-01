import type { UserRole } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrador",
  SECTOR_ADMIN: "Gestor de Setor",
  SECTOR_USER: "Colaborador",
  READONLY: "Somente Leitura",
};

export const ROLE_OPTIONS: { value: UserRole; label: string }[] = (
  Object.entries(ROLE_LABELS) as [UserRole, string][]
).map(([value, label]) => ({ value, label }));

// ADMIN não pode criar/editar outro SUPER_ADMIN — esse papel é reservado
// para suporte cross-tenant da 41 Tech e só é atribuível por quem já o tem.
export function assignableRoles(actingRole: UserRole): UserRole[] {
  return actingRole === "SUPER_ADMIN"
    ? ROLE_OPTIONS.map((r) => r.value)
    : ROLE_OPTIONS.filter((r) => r.value !== "SUPER_ADMIN").map((r) => r.value);
}
