import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { lerConfig } from "@/lib/integracoes/data";
import type { AuthContext } from "@/lib/auth/context";
import { GithubClient } from "./client";
import { githubCallback, githubConfigured, githubServerReady } from "./oauth";
import { credentialsSchema, mergeCredentials } from "./config";
import { GithubError, identity, loginSchema, settingsSchema } from "./rules";
import { ensureConnection, getConnection, guardGeneration, queueInventory, queueRepositories } from "./store";
import { validToken, withGithubLease } from "./sync";
import type { IntegrationView } from "./types";
import { syncProgress } from "./progress";

export async function integrationView(tenantId: string): Promise<IntegrationView> {
  const connection = await getConnection(tenantId);
  const config = connection ? lerConfig(connection.integration.configEnc) : {}, serverReady = githubServerReady();
  const base = { configured: githubConfigured(config), serverReady, callbackUrl: serverReady ? githubCallback() : null,
    clientId: config.clientId ?? "", hasClientSecret: Boolean(config.clientSecret), connected: false, login: null, status: "disconnected", enabled: false, generation: 0,
    timezone: "America/Sao_Paulo", intervalMinutes: 30, error: null, inventoryAt: null, pending: 0, failed: 0, repositories: [], progress: null };
  if (!connection) return base;
  const [repos, progress] = await Promise.all([
    getPrisma().githubRepository.findMany({ where: { tenantId, connectionId: connection.id }, orderBy: { fullName: "asc" }, take: 1001 }),
    syncProgress(connection),
  ]);
  return { ...base, connected: connection.status === "connected", login: connection.login, status: connection.status, enabled: connection.integration.enabled,
    generation: connection.generation, timezone: connection.timezone, intervalMinutes: connection.intervalMinutes,
    error: repos.length > 1000 ? "Mais de 1.000 repositórios encontrados. Refine o acesso da conta para configurar a seleção nesta versão." : connection.lastError,
    inventoryAt: connection.inventoryAt?.toISOString() ?? null, pending: progress.pending, failed: progress.failed, progress,
    repositories: repos.map(repo => ({ id: repo.id, fullName: repo.fullName, owner: repo.owner, private: repo.private, fork: repo.fork,
      archived: repo.archived, selected: repo.selected, accessible: repo.accessible, error: repo.lastError })) };
}
const simpleAction = z.object({ action: z.enum(["pause", "resume", "full", "disconnect", "discover", "track", "untrack"]), generation: z.number().int().nonnegative(), login: loginSchema.optional(), userId: z.string().uuid().optional() });
const AUDIT_ACTIONS = {
  pause: "github.pause", resume: "github.resume", disconnect: "github.disconnect", discover: "github.discover",
  track: "github.track", untrack: "github.untrack", settings: "github.settings", full: "github.full_sync",
} as const;
async function saveCredentials(ctx: AuthContext, input: unknown) {
  const values = credentialsSchema.parse(input);
  if (!githubServerReady()) throw new GithubError("A instalação precisa configurar o endereço público e a chave de proteção das credenciais. Fale com o suporte.", 503);
  await ensureConnection(ctx.tenantId);
  const db = getPrisma(), connection = (await getConnection(ctx.tenantId))!;
  if (connection.generation !== values.generation) throw new GithubError("A conexão mudou. Atualize a tela antes de continuar.", 409);
  const previous = lerConfig(connection.integration.configEnc), credentials = mergeCredentials(values, previous);
  if (credentials.clientId === previous.clientId && credentials.clientSecret === previous.clientSecret) return { ok: true };
  await db.$transaction(async tx => {
    const updated = await tx.githubConnection.updateMany({ where: { id: connection.id, tenantId: ctx.tenantId, generation: values.generation },
      data: { generation: { increment: 1 }, status: connection.githubUserId ? "needs_reconnect" : "disconnected", verifiedAt: null, nextSyncAt: null, lastError: null } });
    if (updated.count !== 1) throw new GithubError("A conexão foi alterada por outra pessoa.", 409);
    await tx.tenantIntegration.update({ where: { id: connection.integrationId }, data: { configEnc: encryptSecret(JSON.stringify(credentials)), enabled: false, lastError: null } });
    await tx.githubOAuthAttempt.deleteMany({ where: { connectionId: connection.id, tenantId: ctx.tenantId } });
    await tx.githubSyncJob.updateMany({ where: { connectionId: connection.id, tenantId: ctx.tenantId, state: "queued" }, data: { state: "canceled" } });
    await tx.githubRepository.updateMany({ where: { connectionId: connection.id, tenantId: ctx.tenantId }, data: { accessible: false, accessCheckedAt: null } });
  });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "github.credentials", entityType: "TenantIntegration", entityId: connection.integrationId });
  return { ok: true };
}
export async function changeIntegration(ctx: AuthContext, input: unknown) {
  if (z.object({ action: z.literal("credentials") }).safeParse(input).success) return saveCredentials(ctx, input);
  const db = getPrisma(), connection = await getConnection(ctx.tenantId);
  if (!connection) throw new GithubError("Conecte a conta GitHub antes de configurar.");
  const selection = z.object({ action: z.literal("settings") }).safeParse(input);
  const action = selection.success ? "settings" : simpleAction.parse(input).action;
  const settings = action === "settings" ? settingsSchema.parse(input) : null;
  const simple = settings ? null : simpleAction.parse(input);
  const generation = settings?.generation ?? simple!.generation;
  if (connection.generation !== generation) throw new GithubError("A conexão mudou. Atualize a tela antes de continuar.", 409);
  if (connection.status !== "connected" && action !== "disconnect") throw new GithubError("Reconecte a conta GitHub para continuar.");
  if (action === "track") {
    if (!simple?.login) throw new GithubError("Informe o login que deseja acompanhar.");
    await withGithubLease(connection.githubUserId!, async owner => {
      const person = identity((await new GithubClient(await validToken(connection, owner)).request(`/users/${encodeURIComponent(simple.login!)}`)).data);
      await db.$transaction(async tx => { await guardGeneration(tx, connection);
        await tx.githubUser.upsert({ where: { connectionId_externalId: { connectionId: connection.id, externalId: person.externalId } },
          create: { tenantId: ctx.tenantId, connectionId: connection.id, ...person, tracked: true }, update: { login: person.login, isBot: person.isBot, tracked: true } }); });
    });
  } else if (action === "untrack") {
    if (!simple?.userId) throw new GithubError("Informe o usuário acompanhado.");
    await db.$transaction(async tx => { await guardGeneration(tx, connection); await tx.githubUser.updateMany({ where: { tenantId: ctx.tenantId, connectionId: connection.id, id: simple.userId! }, data: { tracked: false } }); });
  } else if (action === "discover") {
    await db.$transaction(async tx => { await guardGeneration(tx, connection); await queueInventory(tx, connection); });
  } else {
    const selectedIds = settings ? [...new Set(settings.repositories)] : (await db.githubRepository.findMany({ where: { tenantId: ctx.tenantId, connectionId: connection.id, selected: true }, select: { id: true } })).map(repo => repo.id);
    if (settings) {
      const allowed = await db.githubRepository.count({ where: { tenantId: ctx.tenantId, connectionId: connection.id, id: { in: selectedIds } } });
      if (allowed !== selectedIds.length) throw new GithubError("A seleção contém repositórios de outra conexão.", 403);
      if (settings.timezone !== connection.timezone && await db.githubContribution.count({ where: { tenantId: ctx.tenantId, repository: { connectionId: connection.id } } })) {
        throw new GithubError("O fuso fica fixo após a primeira coleta para preservar a contagem dos dias.");
      }
    }
    const enable = (action === "settings" || action === "resume" || action === "full") && selectedIds.length > 0;
    if ((action === "resume" || action === "full") && !selectedIds.length) throw new GithubError("Selecione ao menos um repositório antes de iniciar.");
    if (action === "full" && !connection.integration.enabled) throw new GithubError("A sincronização está pausada. Retome antes de forçar a atualização completa.");
    const config = action === "disconnect" ? lerConfig(connection.integration.configEnc) : {};
    await db.$transaction(async tx => {
      const updated = await tx.githubConnection.updateMany({ where: { id: connection.id, tenantId: ctx.tenantId, generation }, data: {
        generation: { increment: 1 }, status: action === "disconnect" ? "disconnected" : "connected", lastError: null, nextSyncAt: null,
        ...(action === "disconnect" ? { verifiedAt: null } : {}), ...(settings ? { timezone: settings.timezone, intervalMinutes: settings.intervalMinutes } : {}),
      } });
      if (!updated.count) throw new GithubError("A conexão foi alterada por outra pessoa.", 409);
      await tx.tenantIntegration.update({ where: { id: connection.integrationId }, data: { enabled: enable,
        ...(action === "disconnect" ? { configEnc: encryptSecret(JSON.stringify({ clientId: config.clientId ?? "", clientSecret: config.clientSecret ?? "" })) } : {}) } });
      await tx.githubSyncJob.updateMany({ where: { connectionId: connection.id, tenantId: ctx.tenantId, state: "queued" }, data: { state: "canceled" } });
      if (settings) {
        await tx.githubRepository.updateMany({ where: { connectionId: connection.id, tenantId: ctx.tenantId }, data: { selected: false } });
        await tx.githubRepository.updateMany({ where: { connectionId: connection.id, tenantId: ctx.tenantId, id: { in: selectedIds } }, data: { selected: true } });
      }
      if (enable) {
        const next = { ...connection, generation: generation + 1 };
        await queueInventory(tx, next);
        // Atualização completa: a próxima coleta de cada repositório volta aos 12 meses (26/10/2026).
        await queueRepositories(tx, next, selectedIds.map(id => ({ id })), action === "full");
      }
    }, { timeout: 60000 });
  }
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId,
    action: AUDIT_ACTIONS[action],
    entityType: "TenantIntegration", entityId: connection.integrationId,
    metadata: { ...(settings ? { repositories: settings.repositories.length } : {}) } });
  return { ok: true };
}
