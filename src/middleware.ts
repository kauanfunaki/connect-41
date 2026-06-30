import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { AccessTokenPayload } from "@/lib/auth/types";

// jose usa Web Crypto API — funciona no Edge Runtime (ao contrário de jsonwebtoken).
async function verifyAccessEdge(token: string): Promise<AccessTokenPayload> {
  const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET ?? "");
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  return payload as unknown as AccessTokenPayload;
}

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/login-form",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/health",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookieToken = req.cookies.get("access_token")?.value;
  const authHeader = req.headers.get("authorization");
  const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = cookieToken ?? headerToken;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const payload = await verifyAccessEdge(token);
    const headers = new Headers(req.headers);
    headers.set("x-user-id", payload.sub);
    headers.set("x-tenant-id", payload.tenantId);
    headers.set("x-user-role", payload.role);
    headers.set("x-user-sectors", payload.sectors.join(","));
    return NextResponse.next({ request: { headers } });
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Token inválido ou expirado" }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("access_token");
    return res;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
