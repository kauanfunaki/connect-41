import crypto from "crypto";
import { NextResponse } from "next/server";
import type { UserRole } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { signAccess, signRefresh } from "@/lib/auth/jwt";
import { getAccessibleTenantIds } from "@/lib/auth/tenantAccess";
import { renderConnectLoadingScreenHTML } from "@/components/shared/ConnectLoadingScreen";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from "@/lib/auth/cookies";

// A abertura da sessão da equipe e as respostas da entrada, num lugar só.
//
// Moravam dentro de `api/auth/login-form/route.ts`. Saíram (06/10/2026) porque
// a escolha do escritório (`/login/escritorio/entrar`), quando o e-mail tem
// conta em mais de um, termina na MESMA sessão — tokens, cookies, "lembrar de
// mim" e tela de carregamento — e duas cópias divergiriam na primeira mudança.
// O código é o de antes, movido; o caminho de quem tem um e-mail só não mudou.

/** O que a sessão precisa da conta. */
export type ContaDaEquipe = {
  id: string;
  tenantId: string;
  role: UserRole;
  sectors: { sectorCode: string }[];
};

// O destino entra no HTML de redirect em dois lugares: num atributo (o meta
// refresh) e num <script>. `safeNext` só garante que ele é um caminho interno —
// um `"` ou um `</script>` no `next` fechariam o atributo ou o script e
// injetariam HTML na página logo depois da entrada (06/10/2026). Escapado, um
// caminho normal sai igual.
function emAtributo(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function emScript(valor: string): string {
  return JSON.stringify(valor).replace(/</g, "\\u003c");
}

export function htmlRedirect(to: string): NextResponse {
  // Responde com HTML que redireciona no browser — evita qualquer
  // problema de URL interna do container (0.0.0.0, host errado, etc.)
  return new NextResponse(
    `<!DOCTYPE html><html><head>
      <meta http-equiv="refresh" content="0;url=${emAtributo(to)}">
      <script>window.location.replace(${emScript(to)})</script>
    </head><body></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// Reanexa o "next" no redirect de erro — senão uma senha errada num deep link
// perde o destino e o usuário cai na Home mesmo acertando na tentativa seguinte.
export function loginErrorRedirect(error: string, next: string | null): NextResponse {
  const params = new URLSearchParams({ error });
  if (next) params.set("next", next);
  return htmlRedirect(`/login?${params.toString()}`);
}

// Só pro caminho de sucesso: mesma técnica de redirect via HTML (evita o
// problema de URL interna do container), mas com a tela de carregamento do
// Connect visível por uma janela curta antes do redirect — evita flicker de
// página em branco sem travar o usuário com atraso artificial longo.
function htmlSuccessRedirect(to: string, theme: "light" | "dark"): NextResponse {
  const markup = renderConnectLoadingScreenHTML();
  return new NextResponse(
    `<!DOCTYPE html><html data-theme="${theme}"><head>
      <meta http-equiv="refresh" content="3;url=${emAtributo(to)}">
      <style>html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;}</style>
      <script>setTimeout(function(){window.location.replace(${emScript(to)})},3000)</script>
    </head><body>${markup}</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/**
 * Abre a sessão da conta: access e refresh tokens, o refresh gravado no banco,
 * os dois cookies e a tela de carregamento a caminho do `next` (ou da Home).
 */
export async function abrirSessaoDaEquipe(
  user: ContaDaEquipe,
  { remember, next, theme }: { remember: boolean; next: string | null; theme: "light" | "dark" }
): Promise<NextResponse> {
  const prisma = getPrisma();
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

  // Cookie setado na mesma resposta que entrega o HTML de redirect.
  // O browser processa Set-Cookie antes de executar o meta-refresh.
  const res = htmlSuccessRedirect(next ?? "/home", theme);
  res.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions(accessMaxAge));
  // `refreshMaxAge` varia aqui por causa do "lembrar-me" (30 dias) — por isso
  // não usa a constante.
  res.cookies.set(REFRESH_COOKIE, rawRefresh, refreshCookieOptions(refreshMaxAge));

  return res;
}
