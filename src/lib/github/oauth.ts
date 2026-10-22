import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { lerConfig } from "@/lib/integracoes/data";
import type { AuthContext } from "@/lib/auth/context";
import { GithubClient, readResponse } from "./client";
import { GithubError } from "./rules";
import { getConnection, queueInventory } from "./store";
import { oauthCredentials, type OAuthCredentials } from "./config";

export const oauthHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function githubServerReady() {
  try { githubOrigin(); return Boolean(process.env.APP_PUBLIC_URL && process.env.SECRETS_ENCRYPTION_KEY); }
  catch { return false; }
}
export function githubConfigured(config: Record<string, string>) { return githubServerReady() && Boolean(config.clientId && config.clientSecret); }
export function githubOrigin() {
  const origin = new URL(process.env.APP_PUBLIC_URL ?? "http://localhost:3000");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (!["https:", "http:"].includes(origin.protocol) || process.env.NODE_ENV === "production" && origin.protocol !== "https:" && !loopback) throw new GithubError("Endereço público do Connect inválido.", 503);
  return origin.origin;
}
export function githubCallback() { return `${githubOrigin()}/api/integrations/github/callback`; }
export function authUrl(state: string, verifier: string, clientId: string) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: githubCallback(),
    scope: "read:user repo", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", allow_signup: "false" }).toString();
  return url.toString();
}
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().optional(), expires_in: z.number().positive().optional(), scope: z.string().optional(), token_type: z.string().optional() });
export type TokenConfig = { accessToken: string; refreshToken: string; expiresAt: string; scope: string };
export async function exchangeToken(credentials: OAuthCredentials, params: Record<string, string>, previous?: TokenConfig): Promise<TokenConfig> {
  let response: Response;
  try {
    response = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, client_id: credentials.clientId, client_secret: credentials.clientSecret }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  } catch { throw new GithubError("Falha ao autorizar a conta GitHub. Tente conectar novamente.", 503); }
  if (!response.ok) throw new GithubError("O GitHub recusou a autorização. Reconecte a conta.", 401, undefined, "auth");
  const parsed = tokenSchema.safeParse(await readResponse(response));
  if (!parsed.success) throw new GithubError("A autorização GitHub não pôde ser confirmada.", 401, undefined, "auth");
  const token = parsed.data, scope = token.scope ?? previous?.scope ?? "";
  if (!scope.split(/[ ,]+/).includes("repo")) throw new GithubError("Autorize o acesso aos repositórios para conectar o módulo.", 403);
  return { accessToken: token.access_token, refreshToken: token.refresh_token ?? previous?.refreshToken ?? "",
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : "", scope };
}
export async function beginOAuth(ctx: AuthContext, session: string) {
  if (!githubServerReady()) throw new GithubError("A instalação precisa configurar o endereço público e a chave de proteção das credenciais. Fale com o suporte.", 503);
  if (!session) throw new GithubError("Entre novamente para conectar a conta.", 401);
  const db = getPrisma(), connection = await getConnection(ctx.tenantId);
  const credentials = oauthCredentials(connection ? lerConfig(connection.integration.configEnc) : {});
  if (!connection) throw new GithubError("Salve as credenciais do OAuth App antes de conectar.");
  const state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
  await db.githubOAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.githubOAuthAttempt.create({ data: { stateHash: oauthHash(state), connectionId: connection.id,
    userId: ctx.userId, tenantId: ctx.tenantId, sessionHash: oauthHash(session), verifierEnc: encryptSecret(verifier),
    generation: connection.generation, expiresAt: new Date(Date.now() + 300000) } });
  return { state, url: authUrl(state, verifier, credentials.clientId) };
}
export async function finishOAuth(ctx: AuthContext, session: string, state: string, code: string) {
  const db = getPrisma(), stateHash = oauthHash(state), sessionHash = oauthHash(session);
  const attempt = await db.githubOAuthAttempt.findFirst({ where: { stateHash, tenantId: ctx.tenantId, userId: ctx.userId, sessionHash, expiresAt: { gt: new Date() } } });
  if (!attempt || !session) throw new GithubError("A sessão de conexão expirou ou mudou de escritório. Tente novamente.", 403);
  const consumed = await db.githubOAuthAttempt.deleteMany({ where: { stateHash, sessionHash, expiresAt: { gt: new Date() } } });
  if (consumed.count !== 1) throw new GithubError("Esta tentativa de conexão já foi utilizada.", 403);
  const connection = await db.githubConnection.findFirst({ where: { id: attempt.connectionId, tenantId: ctx.tenantId }, include: { integration: true } });
  if (!connection || connection.generation !== attempt.generation) throw new GithubError("A conexão foi alterada. Inicie uma nova autorização.", 409);
  const credentials = oauthCredentials(lerConfig(connection.integration.configEnc));
  const tokens = await exchangeToken(credentials, { code, redirect_uri: githubCallback(), code_verifier: decryptSecret(attempt.verifierEnc) });
  const viewer = await new GithubClient(tokens.accessToken).viewer();
  const changedAccount = connection.githubUserId !== null && connection.githubUserId !== viewer.externalId;
  await db.$transaction(async tx => {
    const updated = await tx.githubConnection.updateMany({ where: { id: connection.id, tenantId: ctx.tenantId, generation: attempt.generation },
      data: { generation: { increment: 1 }, githubUserId: changedAccount ? connection.githubUserId : viewer.externalId, login: changedAccount ? connection.login : viewer.login, status: changedAccount ? "archived" : "connected", connectedBy: ctx.userId,
        verifiedAt: new Date(), inventoryAt: changedAccount ? null : connection.inventoryAt, nextSyncAt: null, lastError: null } });
    if (updated.count !== 1) throw new GithubError("A conexão foi alterada. Tente novamente.", 409);
    await tx.tenantIntegration.update({ where: { id: connection.integrationId }, data: { enabled: false,
      configEnc: encryptSecret(changedAccount ? "{}" : JSON.stringify({ ...credentials, ...tokens })), lastError: null,
      ...(changedAccount ? { instanceKey: `archive:${connection.id}` } : {}) } });
    await tx.githubSyncJob.updateMany({ where: { connectionId: connection.id, state: "queued" }, data: { state: "canceled" } });
    if (changedAccount) {
      const integration = await tx.tenantIntegration.create({ data: { tenantId: ctx.tenantId, integrationCode: "github", instanceKey: "default", enabled: false, configEnc: encryptSecret(JSON.stringify({ ...credentials, ...tokens })) } });
      const fresh = await tx.githubConnection.create({ data: { tenantId: ctx.tenantId, integrationId: integration.id, githubUserId: viewer.externalId, login: viewer.login,
        status: "connected", connectedBy: ctx.userId, generation: 1, verifiedAt: new Date() } });
      await queueInventory(tx, fresh);
    } else {
      await tx.githubRepository.updateMany({ where: { connectionId: connection.id }, data: { accessible: false, accessCheckedAt: null } });
      await queueInventory(tx, { ...connection, generation: attempt.generation + 1 });
    }
  });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "integration.connect", entityType: "TenantIntegration", entityId: connection.integrationId, metadata: { provider: "github", login: viewer.login } });
}
