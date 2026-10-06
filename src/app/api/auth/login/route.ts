import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { signAccess, signRefresh } from "@/lib/auth/jwt";
import { getAccessibleTenantIds } from "@/lib/auth/tenantAccess";
import { hit, reset, clientIp } from "@/lib/rateLimit";
import { MAX_CONTAS_POR_EMAIL, contasQueConferem, decidirEntrada } from "@/lib/auth/entradaDaEquipe";
import crypto from "crypto";
import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  accessCookieOptions,
  refreshCookieOptions,
} from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

// Entrada por JSON (a tela usa `/api/auth/login-form`). Desde 06/10/2026 segue
// a mesma regra do formulário para o e-mail com conta em mais de um escritório
// (ver `entradaDaEquipe.ts`): a senha é conferida em todas; com mais de uma
// conferindo, quem chama diz em qual entra pelo `tenantId` — sem ele, a
// resposta é 409 com os escritórios que a senha liberou. A lista só sai
// depois da senha certa, como na tela de escolha.
export async function POST(req: NextRequest) {
  try {
    let body: { email?: string; password?: string; tenantId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ error: "email e password são obrigatórios" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const ip = clientIp(req);
    if (!hit(`login-ip:${ip}`, 20).allowed || !hit(`login-email:${normalizedEmail}`, 5).allowed) {
      return NextResponse.json(
        { error: "Muitas tentativas. Tente novamente em alguns minutos." },
        { status: 429 }
      );
    }

    const prisma = getPrisma();
    const contas = await prisma.user.findMany({
      where: { email: normalizedEmail, active: true },
      include: { sectors: true, tenant: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: MAX_CONTAS_POR_EMAIL,
    });

    const conferem = await contasQueConferem(password, contas);
    const tenantPedido = typeof body.tenantId === "string" && body.tenantId ? body.tenantId : null;
    const decisao = decidirEntrada(tenantPedido ? conferem.filter((c) => c.tenantId === tenantPedido) : conferem);
    if (decisao.tipo === "recusar") {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    reset(`login-email:${normalizedEmail}`);

    if (decisao.tipo === "escolher") {
      return NextResponse.json(
        {
          error: "Este e-mail tem acesso a mais de um escritório. Informe o tenantId de um deles.",
          escritorios: decisao.contas.map((c) => ({ tenantId: c.tenantId, nome: c.tenant.name })),
        },
        { status: 409 }
      );
    }

    const user = decisao.conta;
    const sectors = user.sectors.map((s: { sectorCode: string }) => s.sectorCode);
    const accessibleTenants = await getAccessibleTenantIds(user.id, user.role, user.tenantId);
    const accessToken = signAccess({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      sectors,
      accessibleTenants,
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

    // access_token em cookie httpOnly para que o middleware de navegação consiga ler
    res.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions(ACCESS_MAX_AGE));

    res.cookies.set(REFRESH_COOKIE, rawRefresh, refreshCookieOptions(REFRESH_MAX_AGE));

    return res;
  } catch (err) {
    console.error("[POST /api/auth/login]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
