import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { isMicrosoftConfigured, getMicrosoftAuthUrl } from "@/lib/integrations/microsoft";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canManageMeetings(ctx)) {
    return NextResponse.redirect(new URL("/admin/integracoes?error=sem-permissao", req.url));
  }
  if (!isMicrosoftConfigured()) {
    return NextResponse.redirect(new URL("/admin/integracoes?error=microsoft-nao-configurado", req.url));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(getMicrosoftAuthUrl(state));
  res.cookies.set("oauth_state_microsoft", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/microsoft/callback",
    maxAge: 300,
  });
  return res;
}
