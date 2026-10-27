import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, sessionCookieDomain } from "@/lib/auth/cookies";
import { getAuthContext } from "@/lib/auth/context";
import { beginAccountLink } from "@/lib/github/conta";
import { githubOrigin } from "@/lib/github/oauth";
export const dynamic = "force-dynamic";
// Sua conta → Vincular conta GitHub: só confirma a identidade da pessoa (27/10/2026).
export async function GET(request: NextRequest) {
  try {
    const attempt = await beginAccountLink(await getAuthContext(), request.cookies.get(ACCESS_COOKIE)?.value ?? "");
    const response = NextResponse.redirect(attempt.url);
    response.cookies.set("oauth_state_github_conta", attempt.state, { httpOnly: true, secure: new URL(githubOrigin()).protocol === "https:", sameSite: "lax", maxAge: 300,
      domain: sessionCookieDomain(), path: "/api/integrations/github/callback/conta" });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/configuracoes?github=erro#github", githubOrigin()));
  }
}
