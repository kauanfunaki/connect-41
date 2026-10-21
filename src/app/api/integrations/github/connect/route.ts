import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, sessionCookieDomain } from "@/lib/auth/cookies";
import { githubAccess } from "@/lib/github/access";
import { beginOAuth, githubOrigin } from "@/lib/github/oauth";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const ctx = await githubAccess("configurar");
    const attempt = await beginOAuth(ctx, request.cookies.get(ACCESS_COOKIE)?.value ?? "");
    const response = NextResponse.redirect(attempt.url);
    response.cookies.set("oauth_state_github", attempt.state, { httpOnly: true, secure: new URL(githubOrigin()).protocol === "https:", sameSite: "lax", maxAge: 300,
      domain: sessionCookieDomain(), path: "/api/integrations/github/callback" });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/admin/integracoes?integracao=github&error=github-conexao", githubOrigin()));
  }
}
