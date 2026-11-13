import { NextRequest, NextResponse } from "next/server";
import { renovarSessao } from "@/lib/auth/renovacao";
import { safeNext } from "@/lib/auth/entradaDaEquipe";
import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE,
  REFRESH_COOKIE,
  RENOVACAO_COOKIE,
  RENOVACAO_MAX_AGE,
  accessCookieOptions,
  refreshCookieOptions,
  renovacaoCookieOptions,
} from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

// A volta de quem abre o Connect com o access token vencido (13/11/2026, bug-693).
//
// O access token dura 15 minutos, e o cookie dele também: quem fecha a aba e
// volta depois chega ao proxy sem access token. O refresh token (7 a 30 dias)
// estaria lá para renovar, mas o cookie dele só vai a /api/auth (Path), e o
// proxy nunca o recebe numa página. Por isso o proxy manda a navegação para
// cá, onde o navegador entrega o refresh: renovada a sessão, a pessoa volta
// para a página que pediu; sem sessão que valha, vai ao login com o destino.
//
// Redirect com endereço relativo: o `req.url` aqui dentro é o endereço interno
// do container (https://0.0.0.0:3000 na produção), e um endereço absoluto
// montado dele levaria o navegador para lá. Nenhum cookie é apagado no caminho
// do login: um pedido simultâneo pode ter acabado de gravar a sessão nova.

function irPara(caminho: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: caminho, "Cache-Control": "no-store" } });
}

/** A página para onde voltar: só caminho do próprio Connect, e nunca API — o proxy não manda API para cá, e `next=/api/auth/renovar` faria laço. */
function destinoDaVolta(next: string | null): string {
  const caminho = safeNext(next);
  return caminho && !caminho.startsWith("/api/") ? caminho : "/";
}

export async function GET(req: NextRequest) {
  const destino = destinoDaVolta(req.nextUrl.searchParams.get("next"));
  const renovacao = await renovarSessao(req.cookies.get(REFRESH_COOKIE)?.value);

  if (!renovacao.ok) {
    return irPara(destino === "/" ? "/login" : `/login?${new URLSearchParams({ next: destino })}`);
  }

  const res = irPara(destino);
  res.cookies.set(ACCESS_COOKIE, renovacao.accessToken, accessCookieOptions(ACCESS_MAX_AGE));
  res.cookies.set(REFRESH_COOKIE, renovacao.refresh.token, refreshCookieOptions(renovacao.refresh.maxAge));
  res.cookies.set(RENOVACAO_COOKIE, "1", renovacaoCookieOptions(RENOVACAO_MAX_AGE));
  return res;
}
