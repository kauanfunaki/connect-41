// A marca do escritório fora da área logada (22/10/2026): no login do portal,
// na nova senha, no "esqueci minha senha" do cliente e nos e-mails ao cliente.
//
// Dentro do portal a aparência (Administração › Empresa › Aparência do portal,
// 21/10/2026) vem da sessão. Aqui não há sessão, e o portal é um endereço só
// para todos os escritórios — o login não sabe, pelo endereço, de quem é o
// cliente. Por isso o escritório sai, nesta ordem:
//
// 1. do link de nova senha, quando a tela tem um (o token diz de qual conta é);
// 2. de um cookie gravado no último login deste aparelho (`COOKIE_DO_ESCRITORIO`).
//
// Sem nenhum dos dois, vale a marca do Connect — a entrada de sempre.
//
// Só sai daqui o que já é público (ver `MarcaPublica`). Nada da conta.

import { cookies } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import { donoDoTokenDeRedefinicao } from "@/lib/auth/passwordReset";
import { marcaPublicaDoEscritorio, type MarcaPublica } from "@/lib/aparencia/marcaPublica";

export type { MarcaPublica };

/**
 * O escritório do último login neste aparelho. Guarda só o id do escritório —
 * nem a conta, nem o e-mail —, e trocar o valor à mão só troca a marca que a
 * própria pessoa vê.
 */
export const COOKIE_DO_ESCRITORIO = "portal_escritorio";
const UM_ANO_EM_SEGUNDOS = 365 * 24 * 60 * 60;

export function cookieDoEscritorioDoPortal(tenantId: string) {
  return {
    name: COOKIE_DO_ESCRITORIO,
    value: tenantId,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      // "/" e não "/portal": o "esqueci minha senha" do cliente mora em /login/esqueci-senha.
      path: "/",
      maxAge: UM_ANO_EM_SEGUNDOS,
    },
  };
}

/** O id do escritório que o cookie traz, se tiver forma de id. */
export function idDoCookieDoEscritorio(valor: string | undefined | null): string | null {
  const v = valor?.trim();
  return v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

/** O escritório dono de um link de nova senha do portal, sem gastar o link. */
async function escritorioDoToken(token: string): Promise<string | null> {
  const dono = await donoDoTokenDeRedefinicao(token);
  if (!dono || dono.subject !== "PORTAL_USER") return null;
  const conta = await getPrisma().portalUser.findUnique({ where: { id: dono.id }, select: { tenantId: true, active: true } });
  return conta?.active ? conta.tenantId : null;
}

/** A marca da tela de entrada: a do link de nova senha, senão a do último login. */
export async function marcaDaEntradaDoPortal({ token }: { token?: string | null } = {}): Promise<MarcaPublica | null> {
  try {
    const doToken = token ? await escritorioDoToken(token) : null;
    const tenantId = doToken ?? idDoCookieDoEscritorio((await cookies()).get(COOKIE_DO_ESCRITORIO)?.value);
    return await marcaPublicaDoEscritorio(tenantId);
  } catch (err) {
    console.error("[portal] marca da entrada", err instanceof Error ? err.message : err);
    return null;
  }
}
