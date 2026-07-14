import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { AccessTokenPayload } from "@/lib/auth/types";

// jose usa Web Crypto API — funciona tanto no runtime Node quanto no Edge
// (ao contrário de jsonwebtoken). Mantido mesmo após a migração pra Proxy
// (que roda em Node por padrão no Next 16) por já ser runtime-agnóstico.
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
  // Assets estáticos servidos sob /public — sem token, o proxy redirecionava
  // essas requisições pro /login (retornando HTML em vez da imagem), quebrando o
  // logo na tela de login e na tela de loading pós-login (contextos sem sessão).
  "/brand/",
  // Link público de visualização de Documentos para Clientes — o cliente que
  // recebe o e-mail não tem (e não deve precisar de) login no Connect 41. A
  // prova de acesso é o token na própria URL, validado dentro da rota.
  "/d/",
];

// Headers de identidade que SÓ podem ser setados por este proxy. Qualquer
// valor vindo do cliente é removido antes de qualquer decisão — senão um request
// forjado com `x-user-role: SUPER_ADMIN` seria confiado por getAuthContext().
const IDENTITY_HEADERS = [
  "x-user-id",
  "x-tenant-id",
  "x-user-role",
  "x-user-sectors",
  "x-home-tenant-id",
];

function stripIdentityHeaders(headers: Headers): void {
  for (const h of IDENTITY_HEADERS) headers.delete(h);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Sempre parte de headers sem identidade forjável.
  const headers = new Headers(req.headers);
  stripIdentityHeaders(headers);

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers } });
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

    // Troca de workspace: só tem efeito se o tenant do cookie estiver entre os
    // que o próprio token autoriza (accessibleTenants, só populado p/ SUPER_ADMIN).
    // Isso evita depender de acesso a banco aqui no proxy.
    const activeTenantCookie = req.cookies.get("active_tenant_id")?.value;
    const effectiveTenantId =
      activeTenantCookie && payload.accessibleTenants?.includes(activeTenantCookie)
        ? activeTenantCookie
        : payload.tenantId;

    headers.set("x-user-id", payload.sub);
    headers.set("x-tenant-id", effectiveTenantId);
    headers.set("x-user-role", payload.role);
    headers.set("x-user-sectors", effectiveTenantId === payload.tenantId ? payload.sectors.join(",") : "");
    headers.set("x-home-tenant-id", payload.tenantId);
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
  // Sem exclusão por extensão de arquivo: excluir `*.png` do proxy deixava
  // qualquer rota terminada em imagem passar sem stripping dos headers de
  // identidade (bypass latente). Só recursos estáticos internos do Next ficam de fora.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
