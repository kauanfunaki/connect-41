// A sessão do cliente no portal, com e sem "lembrar de mim" (05/10/2026).
//
// Uma regra só para os dois jeitos de entrar — senha e Google —, para "lembrar"
// não durar uma coisa num e outra no outro.
//
// - Sem "lembrar": o de sempre. Token com `PORTAL_ACCESS_TTL` (padrão 12 h) e
//   cookie de 12 h.
// - Com "lembrar": token e cookie de 30 dias, decisão do Kauan em 05/10.
//
// Nada muda na verificação: o proxy só confere se o cookie existe, e
// `verifyPortalAccess` lê a validade do próprio token — os dois aceitam as
// duas durações sem saber qual é. O que a sessão longa pede em troca está no
// layout da área do cliente: conta desativada não entra, mesmo com token
// válido (ver `sessaoAtivaDoPortal`).

import { signPortalAccess } from "./jwt";
import { PORTAL_COOKIE } from "./portal";

export const SESSAO_PADRAO_SEGUNDOS = 12 * 60 * 60;
export const SESSAO_LEMBRADA_SEGUNDOS = 30 * 24 * 60 * 60;

/** A caixa "Lembrar de mim" marcada — no formulário, no estado do Google ou no campo escondido da escolha. */
export function querLembrar(valor: unknown): boolean {
  return valor === "1" || valor === "on" || valor === "true";
}

/** Quanto vivem o token e o cookie. `ttlDoToken` indefinido = o padrão de `signPortalAccess`. */
export function duracaoDaSessaoDoPortal(lembrar: boolean): { ttlDoToken: number | undefined; maxAgeDoCookie: number } {
  return lembrar
    ? { ttlDoToken: SESSAO_LEMBRADA_SEGUNDOS, maxAgeDoCookie: SESSAO_LEMBRADA_SEGUNDOS }
    : { ttlDoToken: undefined, maxAgeDoCookie: SESSAO_PADRAO_SEGUNDOS };
}

export type CookieDaSessaoDoPortal = {
  name: string;
  value: string;
  options: { httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; maxAge: number };
};

/**
 * O cookie da sessão, pronto para gravar — pela server action do login
 * (`cookies().set`) ou pela rota de retorno do Google (`res.cookies.set`).
 */
export function cookieDaSessaoDoPortal(
  conta: { id: string; tenantId: string; clientGroupId: string },
  lembrar: boolean
): CookieDaSessaoDoPortal {
  const duracao = duracaoDaSessaoDoPortal(lembrar);
  const token = signPortalAccess(
    { kind: "portal", sub: conta.id, tenantId: conta.tenantId, clientGroupId: conta.clientGroupId },
    duracao.ttlDoToken
  );
  return {
    name: PORTAL_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: duracao.maxAgeDoCookie,
    },
  };
}
