import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings, getPublicOrigin } from "@/lib/integrations/oauth";
import { exchangeGoogleCode, decodeGoogleEmail } from "@/lib/integrations/google";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const cookieState = req.cookies.get("oauth_state_google")?.value;
  const origin = getPublicOrigin("GOOGLE") || url.origin;

  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/admin/integracoes?error=${reason}`, origin));
    res.cookies.delete("oauth_state_google");
    return res;
  };

  if (errorParam) return fail("google-cancelado");
  if (!code || !state || !cookieState || state !== cookieState) return fail("google-estado-invalido");

  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canManageMeetings(ctx)) return fail("sem-permissao");

  try {
    const tokens = await exchangeGoogleCode(code);
    const accountEmail = decodeGoogleEmail(tokens.id_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const prisma = getPrisma();
    await prisma.oAuthAccount.upsert({
      where: { userId_provider: { userId: ctx.userId, provider: "GOOGLE" } },
      create: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        provider: "GOOGLE",
        accountEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? "",
        expiresAt,
        scope: tokens.scope,
      },
      update: {
        accountEmail,
        accessToken: tokens.access_token,
        // Google só reemite refresh_token no primeiro consent (prompt=consent força isso,
        // mas mantém o fallback por segurança).
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt,
        scope: tokens.scope,
      },
    });
  } catch (err) {
    console.error("[GET /api/integrations/google/callback]", err);
    return fail("google-falha-conexao");
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "integration.connect", entityType: "OAuthAccount", metadata: { provider: "GOOGLE" } });

  const res = NextResponse.redirect(new URL("/admin/integracoes?connected=google", origin));
  res.cookies.delete("oauth_state_google");
  return res;
}
