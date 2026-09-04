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
