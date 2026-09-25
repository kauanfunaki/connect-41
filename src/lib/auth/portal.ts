// A sessão do cliente no portal, e a fronteira que ela não atravessa.
//
// `PortalUser` é tabela separada de `User` — decisão de 2026-09-03, depois de a
// primeira tentativa (papel novo em `User`) ser revertida. A separação existe
// para que "cliente com acesso interno" não seja um estado alcançável por erro
// de cadastro: não há papel para atribuir errado.
//
// A fronteira tem duas metades, e as duas importam:
//
// 1. **Cookie e token próprios**, com `kind: "portal"` recusado pelo
//    verificador interno (ver jwt.ts). Uma sessão não vira a outra nem por
//    engano de cookie.
// 2. **Roteamento por caminho no proxy**, antes de qualquer página rodar — para
//    a decisão não depender de cada tela lembrar de conferir.

import { cookies } from "next/headers";
import { verifyPortalAccess } from "./jwt";
import type { PortalAccessTokenPayload } from "./types";

/** Prefixo único das rotas do cliente. Tudo fora dele é interno. */
export const PREFIXO_DO_PORTAL = "/portal";

/** Cookie próprio — nome diferente do interno de propósito, para não se sobrescreverem. */
export const PORTAL_COOKIE = "portal_access_token";

/**
 * O caminho pedido é do portal?
 *
 * Compara o segmento inteiro, não o prefixo cru: `/portalzinho` **não** é o
 * portal, e um `startsWith` solto deixaria uma rota interna que por acaso
 * começa com as mesmas letras cair do lado errado da fronteira. É a mesma
 * armadilha de casar `<Numero>` e levar `<NumeroLote>`.
 */
export function ehCaminhoDoPortal(pathname: string): boolean {
  return pathname === PREFIXO_DO_PORTAL || pathname.startsWith(`${PREFIXO_DO_PORTAL}/`);
}

/**
 * Rotas do portal que dispensam sessão: entrar, recuperar senha — e o manifesto
 * do PWA.
 *
 * O manifesto entra aqui pelo mesmo motivo que o interno está em `PUBLIC_PATHS`
 * (ver proxy.ts): o navegador o busca no `<head>` de **toda** página do portal,
 * `/portal/login` inclusive, e é ali que ele decide se o site é instalável. Um
 * redirect para o login em vez do JSON tira o botão "instalar" da tela em que o
 * cliente mais vai vê-lo.
 */
const PUBLICAS_DO_PORTAL = [
  "/portal/login",
  "/portal/esqueci-senha",
  "/portal/redefinir-senha",
  "/portal/manifest.webmanifest",
  // A Google Play exige a política numa URL pública: revisor e quem ainda não
  // é cliente leem sem login.
  "/portal/privacidade",
];

export function ehRotaPublicaDoPortal(pathname: string): boolean {
  return PUBLICAS_DO_PORTAL.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Sessão do cliente, lida do cookie próprio.
 *
 * `null` quando não há sessão, quando o token expirou, **ou quando o que está
 * no cookie é uma sessão interna** — `verifyPortalAccess` recusa payload sem
 * `kind: "portal"`.
 */
export async function getPortalSession(): Promise<PortalAccessTokenPayload | null> {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  try {
    return verifyPortalAccess(token);
  } catch {
    return null;
  }
}
