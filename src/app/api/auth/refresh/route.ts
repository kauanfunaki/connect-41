import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyRefresh, signAccess, signRefresh } from "@/lib/auth/jwt";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = req.cookies.get("refresh_token")?.value;
  if (!raw) {
    return NextResponse.json({ error: "Refresh token ausente" }, { status: 401 });
  }

  let payload: ReturnType<typeof verifyRefresh>;
  try {
    payload = verifyRefresh(raw);
  } catch {
    return NextResponse.json({ error: "Refresh token inválido ou expirado" }, { status: 401 });
  }

  const prisma = getPrisma();
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });

  if (!stored || stored.tokenHash !== tokenHash || stored.revokedAt || stored.expiresAt < new Date()) {
    return NextResponse.json({ error: "Refresh token inválido" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub, active: true },
    include: { sectors: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 401 });
  }

  await prisma.refreshToken.update({
    where: { id: payload.jti },
    data: { revokedAt: new Date() },
  });

  const jti = crypto.randomUUID();
  const newRaw = signRefresh({ sub: user.id, jti });
  const newHash = crypto.createHash("sha256").update(newRaw).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);

  await prisma.refreshToken.create({
    data: { id: jti, userId: user.id, tokenHash: newHash, expiresAt },
  });

  const sectors = user.sectors.map((s: { sectorCode: string }) => s.sectorCode);
  const accessToken = signAccess({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    sectors,
  });

  const isProduction = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ accessToken });

  res.cookies.set("access_token", accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15,
  });

  res.cookies.set("refresh_token", newRaw, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}
