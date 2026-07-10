import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings, getPublicOrigin } from "@/lib/integrations/oauth";
import { exchangeMicrosoftCode, fetchMicrosoftEmail } from "@/lib/integrations/microsoft";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const cookieState = req.cookies.get("oauth_state_microsoft")?.value;
  const origin = getPublicOrigin("MICROSOFT") || url.origin;

  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/admin/integracoes?error=${reason}`, origin));
    res.cookies.delete("oauth_state_microsoft");
    return res;
  };

  if (errorParam) return fail("microsoft-cancelado");
  if (!code || !state || !cookieState || state !== cookieState) return fail("microsoft-estado-invalido");

  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canManageMeetings(ctx)) return fail("sem-permissao");

  try {
    const tokens = await exchangeMicrosoftCode(code);
    const accountEmail = await fetchMicrosoftEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const prisma = getPrisma();
    await prisma.oAuthAccount.upsert({
      where: { userId_provider: { userId: ctx.userId, provider: "MICROSOFT" } },
      create: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        provider: "MICROSOFT",
        accountEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? "",
        expiresAt,
        scope: tokens.scope,
      },
      update: {
        accountEmail,
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt,
        scope: tokens.scope,
      },
    });
  } catch (err) {
    console.error("[GET /api/integrations/microsoft/callback]", err);
    return fail("microsoft-falha-conexao");
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "integration.connect", entityType: "OAuthAccount", metadata: { provider: "MICROSOFT" } });

  const res = NextResponse.redirect(new URL("/admin/integracoes?connected=microsoft", origin));
  res.cookies.delete("oauth_state_microsoft");
  return res;
}
