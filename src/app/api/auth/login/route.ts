import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signAccess, signRefresh } from "@/lib/auth/jwt";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "email e password são obrigatórios" }, { status: 400 });
  }

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), active: true },
    include: { sectors: true },
  });

  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const sectors = user.sectors.map((s: { sectorCode: string }) => s.sectorCode);
  const accessToken = signAccess({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    sectors,
  });

  const jti = crypto.randomUUID();
  const rawRefresh = signRefresh({ sub: user.id, jti });
  const tokenHash = crypto.createHash("sha256").update(rawRefresh).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);

  await prisma.refreshToken.create({
    data: { id: jti, userId: user.id, tokenHash, expiresAt },
  });

  const res = NextResponse.json({
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      sectors,
    },
  });

  res.cookies.set("refresh_token", rawRefresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}
