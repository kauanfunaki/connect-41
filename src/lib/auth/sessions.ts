import { cookies } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import { signAccess } from "@/lib/auth/jwt";
import { getAccessibleTenantIds } from "@/lib/auth/tenantAccess";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, accessCookieOptions } from "@/lib/auth/cookies";

// Revoga todos os refresh tokens ativos de um usuário. Chamar quando a senha é
// trocada ou a conta é desativada — assim, combinado com o access token curto
// (15min) + refresh silencioso, a sessão do usuário morre em no máximo ~15min
// (o próximo refresh falha porque o token foi revogado / a conta está inativa).
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Reemite o access token do PRÓPRIO usuário com a lista de tenants acessíveis
// recalculada do banco.
//
// `accessibleTenants` viaja dentro do JWT, e o proxy decide a troca de
// workspace só com o que está no token (de propósito: ele roda no Edge e não
// acessa banco — ver applyIdentityHeaders em src/proxy.ts). Consequência: ao
// ganhar acesso a um workspace novo, o token em uso ainda tem a lista antiga,
// o cookie `active_tenant_id` não é reconhecido e o proxy cai silenciosamente
// de volta no tenant de origem — o usuário cria o workspace e simplesmente não
// consegue entrar nele até o token expirar (15min).
//
// Só serve para o usuário da requisição atual; conceder acesso a OUTRO usuário
// não tem como reescrever o cookie dele, e nesse caso o acesso entra no próximo
// refresh.
export async function reissueAccessTokenForSelf(userId: string): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId, active: true },
    include: { sectors: true },
  });
  if (!user) return;

  const accessToken = signAccess({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    sectors: user.sectors.map((s: { sectorCode: string }) => s.sectorCode),
    accessibleTenants: await getAccessibleTenantIds(user.id, user.role, user.tenantId),
  });

  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, accessCookieOptions(ACCESS_MAX_AGE));
}
