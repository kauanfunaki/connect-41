import jwt from "jsonwebtoken";
import type { AccessTokenPayload, PortalAccessTokenPayload, RefreshTokenPayload } from "./types";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export function signAccess(payload: AccessTokenPayload, ttl?: string): string {
  return jwt.sign(payload, env("JWT_ACCESS_SECRET"), {
    expiresIn: (ttl ?? process.env["JWT_ACCESS_TTL"] ?? "15m") as jwt.SignOptions["expiresIn"],
  });
}

export function signRefresh(payload: RefreshTokenPayload, ttl?: string): string {
  return jwt.sign(payload, env("JWT_REFRESH_SECRET"), {
    expiresIn: (ttl ?? process.env["JWT_REFRESH_TTL"] ?? "7d") as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccess(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env("JWT_ACCESS_SECRET")) as AccessTokenPayload & { kind?: string };
  // Um token de portal nunca vale como sessão interna, mesmo assinado com o
  // mesmo segredo. Recusar aqui é o que torna a separação uma garantia e não
  // uma convenção de nome de cookie.
  if (payload.kind === "portal") throw new Error("Token de portal não vale como sessão interna");
  return payload;
}

/** Sessão do portal — vida mais longa que a interna: o cliente entra pouco e não tem refresh. */
export function signPortalAccess(payload: PortalAccessTokenPayload, ttl?: string): string {
  return jwt.sign(payload, env("JWT_ACCESS_SECRET"), {
    expiresIn: (ttl ?? process.env["PORTAL_ACCESS_TTL"] ?? "12h") as jwt.SignOptions["expiresIn"],
  });
}

export function verifyPortalAccess(token: string): PortalAccessTokenPayload {
  const payload = jwt.verify(token, env("JWT_ACCESS_SECRET")) as PortalAccessTokenPayload;
  // O espelho da recusa acima: sessão interna não abre o portal.
  if (payload.kind !== "portal") throw new Error("Token interno não vale como sessão de portal");
  return payload;
}

export function verifyRefresh(token: string): RefreshTokenPayload {
  return jwt.verify(token, env("JWT_REFRESH_SECRET")) as RefreshTokenPayload;
}

// ─── Escolha de cliente no login do portal ──────────────────────────────────
//
// O portal é uma URL só para todos os clientes do Connect, e o mesmo e-mail pode
// ter conta em dois (o contador que atende duas empresas). Quando a senha
// confere em mais de uma, o login devolve a lista e este token, que carrega as
// contas **já verificadas** — a escolha não pede a senha de novo nem a guarda.
//
// Chave derivada, e não o `JWT_ACCESS_SECRET` puro: `verifyAccess` só recusa
// `kind: "portal"`, então um token de escolha assinado com a mesma chave
// passaria como sessão interna. Com outra chave, nenhum verificador de sessão o
// aceita.

export type PortalEscolhaPayload = { kind: "portal_escolha"; contas: string[] };

function chaveDaEscolha(): string {
  return `${env("JWT_ACCESS_SECRET")}:portal-escolha`;
}

export function signPortalEscolha(contas: string[]): string {
  const payload: PortalEscolhaPayload = { kind: "portal_escolha", contas };
  return jwt.sign(payload, chaveDaEscolha(), { expiresIn: "5m" });
}

/** As contas que a senha liberou, ou `null` se o token expirou, foi forjado ou é de outro tipo. */
export function verifyPortalEscolha(token: string): string[] | null {
  try {
    const payload = jwt.verify(token, chaveDaEscolha()) as Partial<PortalEscolhaPayload>;
    if (payload.kind !== "portal_escolha" || !Array.isArray(payload.contas)) return null;
    return payload.contas.filter((c): c is string => typeof c === "string");
  } catch {
    return null;
  }
}
