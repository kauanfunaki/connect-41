// Entrar com o Google no portal do cliente (05/10/2026).
//
// Decisões do Kauan em 05/10: só no portal (o login da equipe não muda), só
// Google por enquanto, e sem cadastro automático — o Google só confirma o
// e-mail; quem decide se a pessoa entra é o acesso de portal ATIVO com aquele
// e-mail, pela mesma regra do login por senha (um acesso entra direto; mais de
// um, ela escolhe o cliente).
//
// Fluxo próprio, separado do OAuth da Agenda (`src/lib/integrations/google.ts`):
// lá a conta Google da equipe é guardada para criar reuniões; aqui nada do
// Google é guardado. Os dois usam o mesmo cliente OAuth (GOOGLE_CLIENT_ID e
// GOOGLE_CLIENT_SECRET), com redirect URI próprio.
//
// Na URL só vai o que o protocolo exige: o `state` e o `nonce` na ida, o `code`
// na volta. O `state` também fica num cookie httpOnly curto, e a volta só vale
// se os dois baterem — é o que impede alguém de logar a vítima na conta dele.
// O `id_token` é validado pela assinatura (chaves públicas do Google, com
// `jose`), pelo emissor, pelo destinatário (o nosso client id), pelo `nonce` e
// pelo `email_verified`.

import { randomBytes, timingSafeEqual } from "crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const URL_DE_AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_DO_TOKEN = "https://oauth2.googleapis.com/token";
const URL_DAS_CHAVES = "https://www.googleapis.com/oauth2/v3/certs";
const EMISSORES = ["https://accounts.google.com", "accounts.google.com"];

/** Onde começa o fluxo (o botão do login aponta para cá). */
export const CAMINHO_DO_INICIO = "/portal/login/google";
/** O redirect URI do login — é este caminho que se cadastra no Google Cloud. */
export const CAMINHO_DO_RETORNO = "/portal/login/google/callback";

/** O `state`, o `nonce` e o "lembrar", entre a ida e a volta. Só existe no caminho do Google. */
export const COOKIE_DO_ESTADO = "portal_google_estado";
export const MINUTOS_DO_ESTADO = 10;

/**
 * A escolha de cliente quando o e-mail do Google tem acesso a mais de um. Vai
 * em cookie, e não na URL: carrega o token de escolha (as contas liberadas).
 */
export const COOKIE_DA_ESCOLHA = "portal_google_escolha";
export const CAMINHO_DO_COOKIE_DA_ESCOLHA = "/portal/login";
export const MINUTOS_DA_ESCOLHA = 5;

export type ConfiguracaoDoGoogle = { clientId: string; clientSecret: string; redirectUri: string };

type Ambiente = Record<string, string | undefined>;

/**
 * O redirect URI do login do portal.
 *
 * `PORTAL_GOOGLE_REDIRECT_URI`, se definida; senão, o caminho de retorno no
 * domínio de `APP_PUBLIC_URL` — trocar de domínio é trocar uma env só, como nas
 * integrações. Precisa bater, letra por letra, com o cadastrado no Google Cloud.
 */
export function redirectUriDoPortal(env: Ambiente = process.env): string | null {
  const proprio = env.PORTAL_GOOGLE_REDIRECT_URI?.trim();
  if (proprio) {
    try {
      return new URL(proprio).toString();
    } catch {
      return null;
    }
  }
  const publica = env.APP_PUBLIC_URL?.trim();
  if (!publica) return null;
  try {
    return `${new URL(publica).origin}${CAMINHO_DO_RETORNO}`;
  } catch {
    return null;
  }
}

/** A configuração do Google no portal, ou `null` — e aí o botão nem aparece. */
export function configuracaoDoGoogleNoPortal(env: Ambiente = process.env): ConfiguracaoDoGoogle | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = redirectUriDoPortal(env);
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

// ─── A ida ──────────────────────────────────────────────────────────────────

export type EstadoDoGoogle = { state: string; nonce: string; lembrar: boolean };

export function novoEstadoDoGoogle(lembrar: boolean): EstadoDoGoogle {
  return { state: randomBytes(24).toString("base64url"), nonce: randomBytes(24).toString("base64url"), lembrar };
}

/** O valor do cookie do estado. base64url não tem ponto, então o ponto separa. */
export function valorDoCookieDoEstado(e: EstadoDoGoogle): string {
  return `${e.state}.${e.nonce}.${e.lembrar ? "1" : "0"}`;
}

export function lerCookieDoEstado(valor: string | null | undefined): EstadoDoGoogle | null {
  const partes = (valor ?? "").split(".");
  if (partes.length !== 3) return null;
  const [state, nonce, lembrar] = partes as [string, string, string];
  if (!state || !nonce || (lembrar !== "0" && lembrar !== "1")) return null;
  return { state, nonce, lembrar: lembrar === "1" };
}

/**
 * A URL do Google. `prompt=select_account` sempre: quem tem duas contas Google
 * (a pessoal e a da empresa) escolhe qual, em vez de entrar com a que estiver
 * aberta no navegador e receber "sem acesso".
 */
export function urlDeAutorizacaoDoGoogle(cfg: Pick<ConfiguracaoDoGoogle, "clientId" | "redirectUri">, e: EstadoDoGoogle): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: e.state,
    nonce: e.nonce,
    prompt: "select_account",
  });
  return `${URL_DE_AUTORIZACAO}?${params.toString()}`;
}

// ─── A volta ────────────────────────────────────────────────────────────────

/** Por que a volta do Google não deu login — vira `?google=` no login, sem detalhe técnico. */
export type MotivoDoGoogle = "cancelado" | "expirou" | "falhou" | "sem-acesso" | "indisponivel" | "escolha-expirou";

function mesmoTexto(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Confere o que voltou do Google contra o cookie do estado, antes de qualquer
 * chamada ao Google. Cancelar na tela do Google volta com `error`.
 */
export function conferirRetornoDoGoogle(p: {
  cookie: string | null | undefined;
  state: string | null;
  code: string | null;
  erro: string | null;
}): { ok: true; code: string; nonce: string; lembrar: boolean } | { ok: false; motivo: MotivoDoGoogle } {
  if (p.erro) return { ok: false, motivo: "cancelado" };
  const estado = lerCookieDoEstado(p.cookie);
  // Sem cookie: passou dos minutos do estado, ou a volta caiu noutro navegador.
  if (!estado || !p.state || !p.code) return { ok: false, motivo: "expirou" };
  if (!mesmoTexto(estado.state, p.state)) return { ok: false, motivo: "expirou" };
  return { ok: true, code: p.code, nonce: estado.nonce, lembrar: estado.lembrar };
}

/** Troca o `code` pelo `id_token`. Erro aqui é só para o log do servidor. */
export async function trocarCodigoDoGoogle(code: string, cfg: ConfiguracaoDoGoogle, buscar: typeof fetch = fetch): Promise<string> {
  const res = await buscar(URL_DO_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!res.ok) throw new Error(`Google recusou o code (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const corpo = (await res.json()) as { id_token?: unknown };
  if (typeof corpo.id_token !== "string") throw new Error("Google não devolveu id_token");
  return corpo.id_token;
}

let chavesDoGoogle: JWTVerifyGetKey | null = null;

/** As chaves públicas do Google — o `jose` guarda e renova sozinho. */
function chavesPublicasDoGoogle(): JWTVerifyGetKey {
  chavesDoGoogle ??= createRemoteJWKSet(new URL(URL_DAS_CHAVES));
  return chavesDoGoogle;
}

/**
 * Valida o `id_token` e devolve o e-mail confirmado pelo Google.
 *
 * `email_verified` é o que impede uma conta Google criada com o e-mail de
 * outra pessoa, sem confirmar, de entrar no acesso dela.
 */
export async function validarIdTokenDoGoogle(
  idToken: string,
  p: { clientId: string; nonce: string; chaves?: JWTVerifyGetKey; agora?: Date }
): Promise<{ email: string; nome: string | null }> {
  const { payload } = await jwtVerify(idToken, p.chaves ?? chavesPublicasDoGoogle(), {
    issuer: EMISSORES,
    audience: p.clientId,
    algorithms: ["RS256"],
    ...(p.agora ? { currentDate: p.agora } : {}),
  });
  if (typeof payload.nonce !== "string" || !mesmoTexto(payload.nonce, p.nonce)) throw new Error("nonce não confere");
  if (payload.email_verified !== true && payload.email_verified !== "true") throw new Error("e-mail não verificado pelo Google");
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email.includes("@")) throw new Error("id_token sem e-mail");
  return { email, nome: typeof payload.name === "string" ? payload.name : null };
}

// ─── A escolha de cliente ───────────────────────────────────────────────────

/** O cookie da escolha: "lembrar" e o token de escolha (que já tem pontos — o primeiro ponto separa). */
export function valorDoCookieDaEscolha(token: string, lembrar: boolean): string {
  return `${lembrar ? "1" : "0"}.${token}`;
}

export function lerCookieDaEscolha(valor: string | null | undefined): { token: string; lembrar: boolean } | null {
  const v = valor ?? "";
  const ponto = v.indexOf(".");
  if (ponto !== 1) return null;
  const lembrar = v[0];
  const token = v.slice(2);
  if ((lembrar !== "0" && lembrar !== "1") || !token) return null;
  return { token, lembrar: lembrar === "1" };
}

// ─── O que a tela diz ───────────────────────────────────────────────────────

const MENSAGENS: Record<MotivoDoGoogle, string> = {
  cancelado: "A entrada com o Google foi cancelada. Tente de novo quando quiser.",
  expirou: "O tempo para entrar com o Google acabou. Tente de novo.",
  falhou: "Não foi possível confirmar a sua conta do Google. Tente de novo, ou entre com e-mail e senha.",
  "sem-acesso": "Este e-mail do Google não tem acesso ao portal. Entre com o e-mail que o escritório cadastrou para você.",
  indisponivel: "A entrada com o Google não está disponível agora. Entre com e-mail e senha.",
  "escolha-expirou": "A escolha do cliente expirou. Entre de novo.",
};

/**
 * A mensagem do `?google=` do login, ou `null` para valor desconhecido. Sem
 * acesso, aponta a ficha — quando ela está no ar, o botão está logo abaixo.
 */
export function mensagemDoGoogle(motivo: string | null | undefined, p: { fichaDisponivel: boolean }): string | null {
  // `hasOwn`, e não `in`: "toString" está em todo objeto, e viria da URL.
  if (!motivo || !Object.hasOwn(MENSAGENS, motivo)) return null;
  const texto = MENSAGENS[motivo as MotivoDoGoogle];
  return motivo === "sem-acesso" && p.fichaDisponivel ? `${texto} Se ainda não é cliente, use “Quero ser cliente”, abaixo.` : texto;
}
