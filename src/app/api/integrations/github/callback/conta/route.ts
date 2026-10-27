import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, sessionCookieDomain } from "@/lib/auth/cookies";
import { getAuthContext } from "@/lib/auth/context";
import { finishAccountLink } from "@/lib/github/conta";
import { githubOrigin } from "@/lib/github/oauth";
import { GithubError } from "@/lib/github/rules";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const url = new URL(request.url), state = url.searchParams.get("state"), code = url.searchParams.get("code"), saved = request.cookies.get("oauth_state_github_conta")?.value;
  let result = "erro";
  try {
    if (url.searchParams.has("error") || !state || !code || !saved || state.length > 200 || code.length > 1000) throw new Error("Estado inválido");
    const a = Buffer.from(state), b = Buffer.from(saved);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Estado inválido");
    await finishAccountLink(await getAuthContext(), request.cookies.get(ACCESS_COOKIE)?.value ?? "", state, code); result = "vinculado";
  } catch (error) {
    // Nunca registrar código, state ou token. A conta já usada por outra pessoa tem aviso próprio.
    if (error instanceof GithubError && error.status === 409 && error.message.includes("outra pessoa")) result = "em-uso";
  }
  const response = NextResponse.redirect(new URL(`/configuracoes?github=${result}#github`, githubOrigin()));
  response.cookies.set("oauth_state_github_conta", "", { httpOnly: true, secure: new URL(githubOrigin()).protocol === "https:", sameSite: "lax", maxAge: 0,
    domain: sessionCookieDomain(), path: "/api/integrations/github/callback/conta" });
  return response;
}
