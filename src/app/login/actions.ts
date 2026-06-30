"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signAccess, signRefresh } from "@/lib/auth/jwt";
import crypto from "crypto";

export type LoginState = { error: string } | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get("email") as string | null)?.toLowerCase().trim();
  const password = formData.get("password") as string | null;

  if (!email || !password) {
    return { error: "Preencha e-mail e senha" };
  }

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findFirst({
      where: { email, active: true },
      include: { sectors: true },
    });

    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !valid) {
      return { error: "Credenciais inválidas" };
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
    const cookieStore = await cookies();

    cookieStore.set("access_token", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15,
    });

    cookieStore.set("refresh_token", rawRefresh, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 60 * 60 * 24 * 7,
    });
  } catch (err) {
    console.error("[loginAction]", err);
    return { error: "Erro interno. Tente novamente." };
  }

  redirect("/");
}
