import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signAccess, signRefresh } from "@/lib/auth/jwt";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function htmlRedirect(to: string): NextResponse {
  // Responde com HTML que redireciona no browser — evita qualquer
  // problema de URL interna do container (0.0.0.0, host errado, etc.)
  return new NextResponse(
    `<!DOCTYPE html><html><head>
      <meta http-equiv="refresh" content="0;url=${to}">
      <script>window.location.replace(${JSON.stringify(to)})</script>
    </head><body></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const email = (form.get("email") as string | null)?.toLowerCase().trim();
    const password = form.get("password") as string | null;

    if (!email || !password) {
      return htmlRedirect("/login?error=preencha-os-campos");
    }

    const prisma = getPrisma();
    const user = await prisma.user.findFirst({
      where: { email, active: true },
      include: { sectors: true },
    });

    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !valid) {
      return htmlRedirect("/login?error=credenciais-invalidas");
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

    // Cookie setado na mesma resposta que entrega o HTML de redirect.
    // O browser processa Set-Cookie antes de executar o meta-refresh.
    const res = htmlRedirect("/");
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
    return htmlRedirect("/login?error=erro-interno");
  }
}
