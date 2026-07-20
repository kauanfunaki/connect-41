"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { UserRole, SensitiveFieldGroup } from "@/generated/prisma/enums";
import { logAudit } from "@/lib/audit";

// ADMIN pode conceder grants (inclusive a si mesmo) — a proteção desta camada
// é o default-deny + trilha de auditoria, não impedir o administrador do
// tenant de administrar. SUPER_ADMIN já tem bypass em canViewSensitiveField.
export async function alternarPermissaoSensivel(
  role: string,
  fieldGroup: string,
  canView: boolean
): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;

  // SUPER_ADMIN não tem linha em FieldPermission (bypass hardcoded) — não
  // deixar criar grant pra ele evita linha morta que nunca é consultada.
  if (!Object.hasOwn(UserRole, role) || role === "SUPER_ADMIN") return;
  if (!Object.hasOwn(SensitiveFieldGroup, fieldGroup)) return;
  const typedRole = role as keyof typeof UserRole;
  const typedGroup = fieldGroup as keyof typeof SensitiveFieldGroup;

  const prisma = getPrisma();
  await prisma.fieldPermission.upsert({
    where: {
      tenantId_role_fieldGroup: { tenantId: ctx.tenantId, role: typedRole, fieldGroup: typedGroup },
    },
    create: { tenantId: ctx.tenantId, role: typedRole, fieldGroup: typedGroup, canView },
    update: { canView },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: canView ? "fieldPermission.grant" : "fieldPermission.revoke",
    entityType: "FieldPermission",
    metadata: { role, fieldGroup },
  });

  revalidatePath("/admin/permissoes-sensiveis");
}
