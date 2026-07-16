import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signAccess, signRefresh } from "@/lib/auth/jwt";
import { getAccessibleTenantIds } from "@/lib/auth/tenantAccess";
import { hit, reset, clientIp } from "@/lib/rateLimit";
import { renderConnectLoadingScreenHTML } from "@/components/shared/ConnectLoadingScreen";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Só aceita destino relativo interno ("/algo") — nunca "//host" (protocol-relative)
// nem algo com esquema embutido, senão o "next" vindo da query vira open-redirect.
function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

// Reanexa o "next" no redirect de erro — senão uma senha errada num deep link
// perde o destino e o usuário cai na Home mesmo acertando na tentativa seguinte.
function loginErrorRedirect(error: string, next: string | null): NextResponse {
  const params = new URLSearchParams({ error });
  if (next) params.set("next", next);
  return htmlRedirect(`/login?${params.toString()}`);
}

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

// Só pro caminho de sucesso: mesma técnica de redirect via HTML (evita o
// problema de URL interna do container), mas com a tela de carregamento do
// Connect visível por uma janela curta antes do redirect — evita flicker de
// página em branco sem travar o usuário com atraso artificial longo.
function htmlSuccessRedirect(to: string, theme: "light" | "dark"): NextResponse {
  const markup = renderConnectLoadingScreenHTML();
  return new NextResponse(
    `<!DOCTYPE html><html data-theme="${theme}"><head>
      <meta http-equiv="refresh" content="3;url=${to}">
      <style>html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;}</style>
      <script>setTimeout(function(){window.location.replace(${JSON.stringify(to)})},3000)</script>
    </head><body>${markup}</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const email = (form.get("email") as string | null)?.toLowerCase().trim();
    const password = form.get("password") as string | null;
    const remember = form.get("remember") === "on";
    const next = safeNext(form.get("next") as string | null);

    if (!email || !password) {
      return loginErrorRedirect("preencha-os-campos", next);
    }

    // Rate limit por IP e por e-mail (o que estourar primeiro bloqueia). Evita
    // brute force / credential stuffing contra e-mails corporativos conhecidos.
    const ip = clientIp(req);
    if (!hit(`login-ip:${ip}`, 20).allowed || !hit(`login-email:${email}`, 5).allowed) {
      return loginErrorRedirect("muitas-tentativas", next);
    }

    const prisma = getPrisma();
    const user = await prisma.user.findFirst({
      where: { email, active: true },
      include: { sectors: true },
    });

    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !valid) {
      return loginErrorRedirect("credenciais-invalidas", next);
    }

    // Login OK — zera o contador do e-mail para não punir quem errou antes de acertar.
    reset(`login-email:${email}`);

    const sectors = user.sectors.map((s: { sectorCode: string }) => s.sectorCode);

    // Access token é SEMPRE curto (15min) e revalidado pelo refresh silencioso
    // no cliente (SessionKeeper). "Lembrar de mim" estende só o REFRESH token
    // (30d vs 7d) — que é revogável no banco. Assim, desativar um usuário ou
    // trocar a senha derruba a sessão em ~15min, mesmo com "lembrar" marcado.
    const refreshTtl = remember ? "30d" : undefined;
    const accessMaxAge = 60 * 15;
    const refreshMaxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7;

    const accessibleTenants = await getAccessibleTenantIds(user.id, user.role, user.tenantId);
    const accessToken = signAccess({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      sectors,
      accessibleTenants,
    });

    const jti = crypto.randomUUID();
    const rawRefresh = signRefresh({ sub: user.id, jti }, refreshTtl);
    const tokenHash = crypto.createHash("sha256").update(rawRefresh).digest("hex");

    await prisma.refreshToken.create({
      data: { id: jti, userId: user.id, tokenHash, expiresAt: new Date(Date.now() + refreshMaxAge * 1000) },
    });

    const isProduction = process.env.NODE_ENV === "production";
    const theme = req.cookies.get("theme")?.value === "dark" ? "dark" : "light";

    // Cookie setado na mesma resposta que entrega o HTML de redirect.
    // O browser processa Set-Cookie antes de executar o meta-refresh.
    const res = htmlSuccessRedirect(next ?? "/home", theme);
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
