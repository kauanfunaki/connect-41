import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, sessionCookieDomain } from "@/lib/auth/cookies";
import { githubAccess } from "@/lib/github/access";
import { finishOAuth, githubOrigin } from "@/lib/github/oauth";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const url = new URL(request.url), state = url.searchParams.get("state"), code = url.searchParams.get("code"), saved = request.cookies.get("oauth_state_github")?.value;
  let connected = false;
  try {
    if (url.searchParams.has("error") || !state || !code || !saved || state.length > 200 || code.length > 1000) throw new Error("Estado inválido");
    const a = Buffer.from(state), b = Buffer.from(saved);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Estado inválido");
    const ctx = await githubAccess("configurar");
    await finishOAuth(ctx, request.cookies.get(ACCESS_COOKIE)?.value ?? "", state, code); connected = true;
  } catch { /* Nunca registrar código, state ou tokens. A tela permite tentar novamente. */ }
  const response = NextResponse.redirect(new URL(`/admin/integracoes?integracao=github&${connected ? "connected=github" : "error=github-conexao"}`, githubOrigin()));
  response.cookies.set("oauth_state_github", "", { httpOnly: true, secure: new URL(githubOrigin()).protocol === "https:", sameSite: "lax", maxAge: 0,
    domain: sessionCookieDomain(), path: "/api/integrations/github/callback" });
  return response;
}
