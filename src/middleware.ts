import { NextRequest, NextResponse } from "next/server";
import { verifyAccess } from "@/lib/auth/jwt";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/refresh",
  // recursos estáticos são excluídos pelo matcher abaixo
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const payload = verifyAccess(token);
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
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: [
    // Exclui _next/static, _next/image, favicon, arquivos com extensão
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
