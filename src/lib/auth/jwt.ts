import jwt from "jsonwebtoken";
import type { AccessTokenPayload, RefreshTokenPayload } from "./types";

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
  return jwt.verify(token, env("JWT_ACCESS_SECRET")) as AccessTokenPayload;
}

export function verifyRefresh(token: string): RefreshTokenPayload {
  return jwt.verify(token, env("JWT_REFRESH_SECRET")) as RefreshTokenPayload;
}
