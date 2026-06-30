import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRefresh } from "@/lib/auth/jwt";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const raw = req.cookies.get("refresh_token")?.value;

  if (raw) {
    try {
      const payload = verifyRefresh(raw);
      const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
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
  res.cookies.set("refresh_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 0,
  });
  return res;
}
