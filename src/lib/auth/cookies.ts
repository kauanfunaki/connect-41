// Opções dos cookies de sessão, num lugar só.
//
// Existiam nove cópias das mesmas opções espalhadas por login, login-form,
// refresh, logout e sessions.ts. Centralizar deixou de ser arrumação e virou
// necessidade quando o cookie ganhou `domain`: o navegador só apaga um cookie
// se o `domain` do apagamento for IGUAL ao da gravação. Uma cópia esquecida no
// logout deixaria a sessão sobreviver ao logout — e o defeito só apareceria
// depois de o endereço por setor entrar no ar.

const UM_MINUTO = 60;

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

// O refresh fica restrito a /api/auth de propósito: ele não precisa viajar em
// toda navegação, só nas rotas que o consomem.
export const REFRESH_COOKIE_PATH = "/api/auth";

/**
 * Domínio dos cookies de sessão.
 *
 * `undefined` (sem atributo) = cookie host-only, que é o comportamento de
 * sempre e o certo em desenvolvimento.
 *
 * Com `APP_DOMAIN` definido, o cookie passa a valer em `.dominio` para que a
 * sessão atravesse os subdomínios de setor — sem isso, sair de
 * `appteste.useconnect.com.br` para `bpoteste.useconnect.com.br` cairia no
 * login, porque o cookie não acompanharia o host.
 *
 * Efeito colateral aceito conscientemente: o cookie passa a ser enviado a
 * TODOS os subdomínios do domínio-base, incluindo os protótipos em `bpo.`,
 * `societario.` e `dre.` enquanto eles existirem. São aplicações nossas, em
 * domínio privado, e não têm o segredo do JWT para validar o token — e saem do
 * ar na migração de outubro, quando esses endereços passam a ser do Connect.
 */
export function sessionCookieDomain(): string | undefined {
  const bruto = process.env.APP_DOMAIN?.trim().toLowerCase().replace(/^\.+/, "");
  return bruto ? `.${bruto}` : undefined;
}

type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
  domain?: string;
};

function base(path: string, maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path,
    maxAge,
    domain: sessionCookieDomain(),
  };
}

/** `maxAge` em segundos. Use 0 para apagar. */
export function accessCookieOptions(maxAge: number): CookieOptions {
  return base("/", maxAge);
}

export function refreshCookieOptions(maxAge: number): CookieOptions {
  return base(REFRESH_COOKIE_PATH, maxAge);
}

/**
 * A marca de cada entrada no Connect (13/10/2026): um valor novo a cada login,
 * que a tela consegue ler — por isso sem `httpOnly`; não é segredo e não dá
 * acesso a nada. A Ceci usa para dar as boas-vindas uma vez por entrada, e não
 * a cada recarregar da página (`src/lib/ia/chat/boasVindas.ts`). Mesmo
 * `domain` da sessão, para valer nos endereços por setor.
 */
export const ENTRADA_COOKIE = "c41_entrada";

export function entradaCookieOptions(maxAge: number): Omit<CookieOptions, "httpOnly"> & { httpOnly: false } {
  return { ...base("/", maxAge), httpOnly: false };
}

/** Um valor novo para a marca da entrada: o instante e um pedaço aleatório, em base 36. */
export function novaEntrada(agora = Date.now()): string {
  return `${agora.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Mesmos TTLs de antes: 15 min para o access (igual ao JWT_ACCESS_TTL) e 7 dias
// para o refresh.
export const ACCESS_MAX_AGE = 15 * UM_MINUTO;
export const REFRESH_MAX_AGE = 7 * 24 * 60 * UM_MINUTO;
