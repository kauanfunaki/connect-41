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
  // Chamado por scheduler externo (n8n), sem sessão de usuário — autentica a
  // própria requisição via CRON_SERVICE_TOKEN dentro do route handler (ver
  // src/app/api/cron/alerts/route.ts), não pelo JWT deste proxy.
  "/api/cron/",
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

function loginRedirect(req: NextRequest): NextResponse {
  const url = new URL("/login", req.url);
  // Preserva o destino original (login-form devolve pra cá em vez de sempre
  // cair na Home) — só o pathname+search, nunca a origin, pra não virar
  // open-redirect caso alguém monte a URL de fora.
  const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

function applyIdentityHeaders(headers: Headers, payload: AccessTokenPayload, req: NextRequest): void {
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
}

// Renova o access token via /api/auth/refresh quando ele já expirou mas o
// refresh token (7-30d) ainda é válido — sem isso, abrir um link direto ou
// voltar numa aba depois de o access token (15min) expirar forçava login
// mesmo com sessão válida (o refresh silencioso do SessionKeeper só roda com
// a aba aberta e em foco, não ajuda no primeiro request de uma navegação nova).
// Delegado à própria rota (Node — Prisma, jsonwebtoken, crypto) em vez de
// duplicar a lógica de rotação de refresh token aqui no proxy.
async function tryRefresh(req: NextRequest): Promise<{ accessToken: string; setCookies: string[] } | null> {
  const refreshToken = req.cookies.get("refresh_token")?.value;
  if (!refreshToken) return null;

  try {
    const res = await fetch(new URL("/api/auth/refresh", req.url), {
      method: "POST",
      headers: { cookie: `refresh_token=${refreshToken}` },
    });
    if (!res.ok) return null;
    const { accessToken } = (await res.json()) as { accessToken: string };
    return { accessToken, setCookies: res.headers.getSetCookie() };
  } catch {
    return null;
  }
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
    return loginRedirect(req);
  }

  try {
    const payload = await verifyAccessEdge(token);
    applyIdentityHeaders(headers, payload, req);
    return NextResponse.next({ request: { headers } });
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Token inválido ou expirado" }, { status: 401 });
    }

    const refreshed = await tryRefresh(req);
    if (refreshed) {
      try {
        const payload = await verifyAccessEdge(refreshed.accessToken);
        applyIdentityHeaders(headers, payload, req);
        const res = NextResponse.next({ request: { headers } });
        for (const cookie of refreshed.setCookies) res.headers.append("set-cookie", cookie);
        return res;
      } catch {
        // Token recém-emitido não deveria falhar aqui — mas se falhar, cai
        // no redirect de login normal abaixo em vez de propagar o erro.
      }
    }

    const res = loginRedirect(req);
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
