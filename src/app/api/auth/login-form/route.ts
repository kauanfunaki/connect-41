import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signAccess, signRefresh } from "@/lib/auth/jwt";
import { getAccessibleTenantIds } from "@/lib/auth/tenantAccess";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function htmlRedirect(to: string): NextResponse {
  // Responde com HTML que redireciona no browser â€” evita qualquer
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
    const remember = form.get("remember") === "on";

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

    // "Lembrar de mim" estende a sessão inteira (access + refresh) para 30 dias.
    // Sem auto-refresh silencioso no cliente hoje, o access_token é o que
    // efetivamente controla por quanto tempo o usuário fica logado.
    const accessTtl = remember ? "30d" : undefined;
    const refreshTtl = remember ? "30d" : undefined;
    const accessMaxAge = remember ? 60 * 60 * 24 * 30 : 60 * 15;
    const refreshMaxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7;

    const accessibleTenants = await getAccessibleTenantIds(user.id, user.role, user.tenantId);
    const accessToken = signAccess(
      { sub: user.id, tenantId: user.tenantId, role: user.role, sectors, accessibleTenants },
      accessTtl
    );

    const jti = crypto.randomUUID();
    const rawRefresh = signRefresh({ sub: user.id, jti }, refreshTtl);
    const tokenHash = crypto.createHash("sha256").update(rawRefresh).digest("hex");

    await prisma.refreshToken.create({
      data: { id: jti, userId: user.id, tokenHash, expiresAt: new Date(Date.now() + refreshMaxAge * 1000) },
    });

    const isProduction = process.env.NODE_ENV === "production";

    // Cookie setado na mesma resposta que entrega o HTML de redirect.
    // O browser processa Set-Cookie antes de executar o meta-refresh.
    const res = htmlRedirect("/home");
    res.cookies.set("access_token", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: accessMaxAge,
    });
    res.cookies.set("refresh_token", rawRefresh, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: refreshMaxAge,
    });

    return res;
  } catch (err) {
    console.error("[POST /api/auth/login-form]", err);
    return htmlRedirect("/login?error=erro-interno");
  }
}
