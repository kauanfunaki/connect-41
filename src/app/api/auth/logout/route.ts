import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyRefresh } from "@/lib/auth/jwt";
import crypto from "crypto";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = req.cookies.get("refresh_token")?.value;

  if (raw) {
    try {
      const payload = verifyRefresh(raw);
      const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
      const prisma = getPrisma();
      const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
      if (stored && stored.tokenHash === tokenHash && !stored.revokedAt) {
        await prisma.refreshToken.update({
          where: { id: payload.jti },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // token inválido/expirado — apenas limpa o cookie
    }
  }

  const res = NextResponse.json({ ok: true });
  // maxAge 0 com AS MESMAS opções da gravação — inclusive `domain`. Atributo
  // diferente não apaga o cookie, cria outro.
  res.cookies.set(ACCESS_COOKIE, "", accessCookieOptions(0));
  res.cookies.set(REFRESH_COOKIE, "", refreshCookieOptions(0));
  return res;
}
