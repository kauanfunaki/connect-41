import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { lerConfig } from "@/lib/integracoes/data";
import { podeNoModulo } from "@/lib/auth/modulo";
import type { AuthContext } from "@/lib/auth/context";
import { GithubClient } from "./client";
import { oauthCredentials } from "./config";
import { authUrl, exchangeToken, githubAccountCallback, githubConfigured, oauthHash } from "./oauth";
import { GithubError } from "./rules";
import { getConnection } from "./store";
import { GITHUB_MODULE } from "./types";

// Vínculo da pessoa do Connect com a própria conta GitHub, feito em Sua conta (27/10/2026).
// O OAuth só confirma quem a pessoa é no GitHub: o token, sem escopo, é descartado
// depois de ler o ID estável, e nada da conta do escritório muda.
export type AccountLinkView = { available: boolean; reason: string | null; link: { login: string; linkedAt: string } | null };

export async function accountLinkView(ctx: AuthContext): Promise<AccountLinkView | null> {
  if (!ctx.tenantId || !ctx.userId || !await podeNoModulo(ctx, GITHUB_MODULE, "ver")) return null;
  const [connection, link] = await Promise.all([getConnection(ctx.tenantId),
    getPrisma().githubAccountLink.findFirst({ where: { tenantId: ctx.tenantId, userId: ctx.userId }, select: { login: true, linkedAt: true } })]);
  const configured = connection ? githubConfigured(lerConfig(connection.integration.configEnc)) : false;
  return { available: configured, reason: configured ? null : "O OAuth App do GitHub do escritório ainda não foi configurado em Integrações.",
    link: link ? { login: link.login, linkedAt: link.linkedAt.toISOString() } : null };
}

async function accountAccess(ctx: AuthContext) {
  if (!ctx.tenantId || !ctx.userId) throw new GithubError("Entre novamente para continuar.", 401);
  if (!await podeNoModulo(ctx, GITHUB_MODULE, "ver")) throw new GithubError("Módulo GitHub indisponível para este acesso.", 403);
}

export async function beginAccountLink(ctx: AuthContext, session: string) {
  await accountAccess(ctx);
  if (!session) throw new GithubError("Entre novamente para vincular a conta.", 401);
  const db = getPrisma(), connection = await getConnection(ctx.tenantId);
  if (!connection) throw new GithubError("O OAuth App do GitHub do escritório ainda não foi configurado.");
  const credentials = oauthCredentials(lerConfig(connection.integration.configEnc));
  const state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
  await db.githubOAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.githubOAuthAttempt.create({ data: { stateHash: oauthHash(state), connectionId: connection.id, purpose: "account",
    userId: ctx.userId, tenantId: ctx.tenantId, sessionHash: oauthHash(session), verifierEnc: encryptSecret(verifier),
    generation: connection.generation, expiresAt: new Date(Date.now() + 300000) } });
  return { state, url: authUrl(state, verifier, credentials.clientId, "account") };
}

export async function finishAccountLink(ctx: AuthContext, session: string, state: string, code: string) {
  await accountAccess(ctx);
  const db = getPrisma(), stateHash = oauthHash(state), sessionHash = oauthHash(session);
  const where = { stateHash, tenantId: ctx.tenantId, userId: ctx.userId, sessionHash, purpose: "account", expiresAt: { gt: new Date() } };
  const attempt = await db.githubOAuthAttempt.findFirst({ where });
  if (!attempt || !session) throw new GithubError("A tentativa de vínculo expirou. Tente novamente.", 403);
  if ((await db.githubOAuthAttempt.deleteMany({ where })).count !== 1) throw new GithubError("Esta tentativa de vínculo já foi utilizada.", 403);
  const connection = await db.githubConnection.findFirst({ where: { id: attempt.connectionId, tenantId: ctx.tenantId }, include: { integration: true } });
  if (!connection) throw new GithubError("A integração GitHub do escritório mudou. Tente novamente.", 409);
  const credentials = oauthCredentials(lerConfig(connection.integration.configEnc));
  const tokens = await exchangeToken(credentials, { code, redirect_uri: githubAccountCallback(), code_verifier: decryptSecret(attempt.verifierEnc) }, undefined, false);
  const viewer = await new GithubClient(tokens.accessToken).viewer();
  const other = await db.githubAccountLink.findFirst({ where: { tenantId: ctx.tenantId, externalId: viewer.externalId, userId: { not: ctx.userId } }, select: { id: true } });
  if (other) throw new GithubError("Esta conta GitHub já está vinculada a outra pessoa do escritório.", 409);
  await db.githubAccountLink.upsert({ where: { userId: ctx.userId }, create: { tenantId: ctx.tenantId, userId: ctx.userId, externalId: viewer.externalId, login: viewer.login },
    update: { externalId: viewer.externalId, login: viewer.login, linkedAt: new Date() } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "github.account_link", entityType: "User", entityId: ctx.userId, metadata: { login: viewer.login } });
  return viewer.login;
}

export async function unlinkAccount(ctx: AuthContext) {
  if (!ctx.tenantId || !ctx.userId) throw new GithubError("Entre novamente para continuar.", 401);
  const removed = await getPrisma().githubAccountLink.deleteMany({ where: { tenantId: ctx.tenantId, userId: ctx.userId } });
  if (removed.count) await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "github.account_unlink", entityType: "User", entityId: ctx.userId });
}

/** Nome no Connect de cada conta GitHub vinculada, pelo ID estável do GitHub. */
export async function linkedPeople(tenantId: string) {
  const links = await getPrisma().githubAccountLink.findMany({ where: { tenantId }, select: { externalId: true, user: { select: { name: true } } } });
  return new Map(links.map(link => [link.externalId, link.user.name]));
}
