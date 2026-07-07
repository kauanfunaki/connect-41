import { getPrisma } from "@/lib/prisma";
import type { SensitiveFieldGroup } from "@/generated/prisma/enums";
import type { AuthContext } from "@/lib/auth/context";

// Camada de permissão por campo/documento sensível (dados bancários, médicos,
// salário, documentos pessoais), independente do RBAC por setor. Diferente de
// isFullAccess()/isFullWrite(): aqui só SUPER_ADMIN (suporte 41 Tech) tem bypass
// automático — ADMIN do tenant precisa de grant explícito, porque o objetivo
// desta camada é justamente restringir dado sensível mesmo de quem administra
// o tenant. Ausência de linha em FieldPermission = negado por padrão.
export async function canViewSensitiveField(
  ctx: AuthContext,
  fieldGroup: SensitiveFieldGroup
): Promise<boolean> {
  if (ctx.role === "SUPER_ADMIN") return true;

  const prisma = getPrisma();
  const grant = await prisma.fieldPermission.findUnique({
    where: { tenantId_role_fieldGroup: { tenantId: ctx.tenantId, role: ctx.role, fieldGroup } },
  });
  return grant?.canView ?? false;
}
