import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings, getPublicOrigin } from "@/lib/integrations/oauth";
import { isGoogleConfigured, getGoogleAuthUrl } from "@/lib/integrations/google";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = getPublicOrigin("GOOGLE") || new URL(req.url).origin;
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canManageMeetings(ctx)) {
    return NextResponse.redirect(new URL("/admin/integracoes?error=sem-permissao", origin));
  }
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/admin/integracoes?error=google-nao-configurado", origin));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(getGoogleAuthUrl(state));
  res.cookies.set("oauth_state_google", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/google/callback",
    maxAge: 300,
  });
  return res;
}
