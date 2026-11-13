import { NextRequest, NextResponse } from "next/server";
import { renovarSessao } from "@/lib/auth/renovacao";
import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

// A renovação do SessionKeeper, com a aba aberta. A rotação (e a tolerância a
// dois pedidos com o mesmo token) mora em src/lib/auth/renovacao.ts, que a
// volta pelo proxy (/api/auth/renovar) também usa.
export async function POST(req: NextRequest) {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!raw) {
    return NextResponse.json({ error: "Refresh token ausente" }, { status: 401 });
  }

  const renovacao = await renovarSessao(raw);
  if (!renovacao.ok) {
    return NextResponse.json({ error: "Refresh token inválido" }, { status: 401 });
  }

  const res = NextResponse.json({ accessToken: renovacao.accessToken });
  res.cookies.set(ACCESS_COOKIE, renovacao.accessToken, accessCookieOptions(ACCESS_MAX_AGE));
  res.cookies.set(REFRESH_COOKIE, renovacao.refresh.token, refreshCookieOptions(renovacao.refresh.maxAge));
  return res;
}
