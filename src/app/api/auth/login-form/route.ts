import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signAccess, signRefresh } from "@/lib/auth/jwt";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function getOrigin(req: NextRequest): string {
  // Reverse proxies (EasyPanel/Nginx) injetam x-forwarded-* com a URL pública.
  // req.nextUrl.origin resolve para o endereço interno do container (0.0.0.0).
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const base = getOrigin(req);

  try {
    const form = await req.formData();
    const email = (form.get("email") as string | null)?.toLowerCase().trim();
    const password = form.get("password") as string | null;

    if (!email || !password) {
      return NextResponse.redirect(`${base}/login?error=preencha-os-campos`, { status: 303 });
    }

    const prisma = getPrisma();
    const user = await prisma.user.findFirst({
      where: { email, active: true },
      include: { sectors: true },
    });

    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !valid) {
      return NextResponse.redirect(`${base}/login?error=credenciais-invalidas`, { status: 303 });
    }

    const sectors = user.sectors.map((s: { sectorCode: string }) => s.sectorCode);
    const accessToken = signAccess({ sub: user.id, tenantId: user.tenantId, role: user.role, sectors });

    const jti = crypto.randomUUID();
    const rawRefresh = signRefresh({ sub: user.id, jti });
    const tokenHash = crypto.createHash("sha256").update(rawRefresh).digest("hex");

    await prisma.refreshToken.create({
      data: { id: jti, userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    });

    const isProduction = process.env.NODE_ENV === "production";

    // 303 HTTP real — browser segue o redirect com os cookies já aplicados
    const res = NextResponse.redirect(`${base}/`, { status: 303 });

    res.cookies.set("access_token", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15,
    });

    res.cookies.set("refresh_token", rawRefresh, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (err) {
    console.error("[POST /api/auth/login-form]", err);
    return NextResponse.redirect(`${base}/login?error=erro-interno`, { status: 303 });
  }
}
