import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyRefresh } from "@/lib/auth/jwt";
import crypto from "crypto";

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

  const isProduction = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ ok: true });
  res.cookies.set("access_token", "", { httpOnly: true, secure: isProduction, sameSite: "strict", path: "/", maxAge: 0 });
  res.cookies.set("refresh_token", "", { httpOnly: true, secure: isProduction, sameSite: "strict", path: "/api/auth", maxAge: 0 });
  return res;
}
