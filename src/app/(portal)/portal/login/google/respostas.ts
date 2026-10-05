import { NextResponse } from "next/server";
import { COOKIE_DO_ESTADO, CAMINHO_DO_INICIO, type MotivoDoGoogle } from "@/lib/auth/googleDoPortal";

// As respostas das duas rotas do "Entrar com o Google" (05/10/2026).
//
// Redirect com `Location` relativo de propósito: atrás do proxy do EasyPanel,
// `req.url` traz o host interno do container (ver `getPublicOrigin`), e um
// endereço absoluto montado dele mandaria o cliente para 0.0.0.0. Relativo, o
// navegador resolve contra o endereço em que a pessoa está.

export function irPara(caminho: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: caminho } });
}

/** De volta ao login, com o motivo em `?google=` — um código, nunca detalhe técnico. */
export function voltarAoLogin(motivo?: MotivoDoGoogle): NextResponse {
  return irPara(motivo ? `/portal/login?google=${motivo}` : "/portal/login");
}

export const OPCOES_DO_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

/** O estado da ida serve uma vez só: toda volta, boa ou ruim, apaga. */
export function semEstado(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_DO_ESTADO, "", { ...OPCOES_DO_COOKIE, path: CAMINHO_DO_INICIO, maxAge: 0 });
  return res;
}
