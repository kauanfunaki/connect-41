import { NextRequest, NextResponse } from "next/server";
import {
  CAMINHO_DO_INICIO,
  COOKIE_DO_ESTADO,
  MINUTOS_DO_ESTADO,
  configuracaoDoGoogleNoPortal,
  novoEstadoDoGoogle,
  urlDeAutorizacaoDoGoogle,
  valorDoCookieDoEstado,
} from "@/lib/auth/googleDoPortal";
import { OPCOES_DO_COOKIE, voltarAoLogin } from "./respostas";

export const dynamic = "force-dynamic";

/**
 * O botão "Entrar com o Google" do login do portal (05/10/2026): guarda o
 * `state`, o `nonce` e o "lembrar de mim" num cookie httpOnly curto e manda a
 * pessoa ao Google. Pública no proxy pela regra de `/portal/login`.
 */
export async function GET(req: NextRequest) {
  const cfg = configuracaoDoGoogleNoPortal();
  if (!cfg) return voltarAoLogin("indisponivel");

  const lembrar = req.nextUrl.searchParams.get("lembrar") === "1";

  // O cookie do estado tem de nascer no endereço da volta: cookie é por host,
  // e quem abriu o portal por outro endereço (o de um setor, por exemplo)
  // voltaria do Google sem ele. Passa uma vez pelo endereço certo; o
  // `canonico=1` impede ida e volta sem fim se o host vier diferente atrás do
  // proxy.
  const destino = new URL(cfg.redirectUri);
  const host = req.headers.get("host")?.toLowerCase();
  if (host && host !== destino.host.toLowerCase() && req.nextUrl.searchParams.get("canonico") !== "1") {
    const noEnderecoCerto = new URL(CAMINHO_DO_INICIO, destino.origin);
    noEnderecoCerto.searchParams.set("lembrar", lembrar ? "1" : "0");
    noEnderecoCerto.searchParams.set("canonico", "1");
    return NextResponse.redirect(noEnderecoCerto, 303);
  }

  const estado = novoEstadoDoGoogle(lembrar);
  const res = NextResponse.redirect(urlDeAutorizacaoDoGoogle(cfg, estado), 303);
  res.cookies.set(COOKIE_DO_ESTADO, valorDoCookieDoEstado(estado), {
    ...OPCOES_DO_COOKIE,
    path: CAMINHO_DO_INICIO,
    maxAge: MINUTOS_DO_ESTADO * 60,
  });
  return res;
}
