import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings, getPublicOrigin } from "@/lib/integrations/oauth";
import { isMicrosoftConfigured, getMicrosoftAuthUrl } from "@/lib/integrations/microsoft";
import crypto from "crypto";
import { sessionCookieDomain } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = getPublicOrigin("MICROSOFT") || new URL(req.url).origin;
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canManageMeetings(ctx)) {
    return NextResponse.redirect(new URL("/admin/integracoes?error=sem-permissao", origin));
  }
  if (!isMicrosoftConfigured()) {
    return NextResponse.redirect(new URL("/admin/integracoes?error=microsoft-nao-configurado", origin));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(getMicrosoftAuthUrl(state));
  res.cookies.set("oauth_state_microsoft", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/microsoft/callback",
    maxAge: 300,
    // Com o domínio (05/10/2026): quem conecta a partir de `bpo.` volta pelo
    // endereço do retorno cadastrado (`app.`), e sem isto o cookie ficava no
    // host de origem e o retorno dava "estado inválido".
    domain: sessionCookieDomain(),
  });
  return res;
}
