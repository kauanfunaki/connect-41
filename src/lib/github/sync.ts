import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type GithubRepository, type GithubSyncJob } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { lerConfig, abrirExecucao, encerrarExecucao } from "@/lib/integracoes/data";
import { encryptSecret } from "@/lib/crypto";
import { isModuleEnabled } from "@/lib/modules";
import { isSubscriptionReadOnly } from "@/lib/subscription-policy";
import { GithubClient, hasNext, repoPath, repositorySchema } from "./client";
import { exchangeToken, type TokenConfig } from "./oauth";
import { oauthCredentials } from "./config";
import { GithubError, historyStart, normalize } from "./rules";
import { GITHUB_MODULE, type ContributionType } from "./types";
import { type GithubDb, getConnection, guardGeneration, initialWindow, jobCursor, persistContributions, queueInventory, queueRepositories, queueResource, rebuildDaily } from "./store";

type Connection = NonNullable<Awaited<ReturnType<typeof getConnection>>>;
const LEASE_MS = 120000;
export async function withGithubLease<T>(identity: string, fn: (owner: string) => Promise<T>): Promise<T> {
  const db = getPrisma(), now = new Date(), owner = randomUUID();
  await db.githubAccountLease.upsert({ where: { githubUserId: identity }, create: { githubUserId: identity }, update: {} });
  const lease = await db.githubAccountLease.updateMany({ where: { githubUserId: identity,
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { lt: now } }] }, { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }] },
    data: { owner, expiresAt: new Date(Date.now() + LEASE_MS) } });
  if (!lease.count) throw new GithubError("Outra consulta está em andamento ou o GitHub pediu uma espera. Tente novamente em instantes.", 409);
  try { return await fn(owner); }
  finally { await db.githubAccountLease.updateMany({ where: { githubUserId: identity, owner }, data: { owner: null, expiresAt: null } }); }
}
async function guardLease(tx: GithubDb, connection: Connection, owner: string) {
  const lease = await tx.githubAccountLease.updateMany({ where: { githubUserId: connection.githubUserId!, owner, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date(Date.now() + LEASE_MS) } });
  if (!lease.count) throw new GithubError("A sincronização foi assumida por outro executor.", 409);
  await guardGeneration(tx, connection);
}
export async function validToken(connection: Connection, owner: string): Promise<string> {
  const config = lerConfig(connection.integration.configEnc);
  if (!config.accessToken) throw new GithubError("Reconecte a conta GitHub em Integrações.", 401, undefined, "auth");
  if (!config.expiresAt || Date.parse(config.expiresAt) > Date.now() + 60000) return config.accessToken;
  if (!config.refreshToken) throw new GithubError("Autorização GitHub expirada. Reconecte a conta.", 401, undefined, "auth");
  const fresh = await exchangeToken(oauthCredentials(config), { grant_type: "refresh_token", refresh_token: config.refreshToken }, config as TokenConfig);
  await getPrisma().$transaction(async tx => {
    await guardLease(tx, connection, owner);
    await tx.tenantIntegration.update({ where: { id: connection.integrationId }, data: { configEnc: encryptSecret(JSON.stringify({ ...config, ...fresh })) } });
  });
  return fresh.accessToken;
}
async function allowSync(connection: Connection, allowReadOnly = false) {
  const db = getPrisma();
  if (connection.status !== "connected" || !connection.githubUserId || !await isModuleEnabled(connection.tenantId, GITHUB_MODULE)) return false;
  if (allowReadOnly) return true;
  const subscription = await db.subscription.findUnique({ where: { tenantId: connection.tenantId }, select: { status: true } });
  return !isSubscriptionReadOnly(subscription?.status);
}
export async function scheduleSync(connection: Connection, manual = false) {
  const db = getPrisma();
  if (!await allowSync(connection)) return;
  if (!manual && (!connection.integration.enabled || connection.nextSyncAt && connection.nextSyncAt > new Date())) return;
  await db.$transaction(async tx => {
    await guardGeneration(tx, connection);
    await queueInventory(tx, connection);
    if (connection.integration.enabled) {
      const repos = await tx.githubRepository.findMany({ where: { connectionId: connection.id, tenantId: connection.tenantId, selected: true }, select: { id: true } });
      await queueRepositories(tx, connection, repos);
    }
    await tx.githubConnection.update({ where: { id: connection.id }, data: { nextSyncAt: new Date(Date.now() + connection.intervalMinutes * 60000) } });
  }, { timeout: 60000 });
}
async function failure(connection: Connection, owner: string, error: unknown, job?: GithubSyncJob) {
  const db = getPrisma();
  const known = error instanceof GithubError ? error : new GithubError("Resposta ou lote GitHub inválido. Confira a integração e tente novamente.", 502, undefined, "network");
  if (known.status === 409) return;
  const retryAt = known.retryAt ?? new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(job?.attempts ?? 0, 6)));
  await db.$transaction(async tx => {
    await guardLease(tx, connection, owner);
    if (known.category === "auth") {
      await tx.githubConnection.update({ where: { id: connection.id }, data: { status: "needs_reconnect", verifiedAt: null, lastError: known.message } });
    } else await tx.githubConnection.update({ where: { id: connection.id }, data: { lastError: known.message } });
    if (known.category === "limit") await tx.githubAccountLease.updateMany({ where: { githubUserId: connection.githubUserId!, owner }, data: { nextAttemptAt: retryAt } });
    if (job) {
      await tx.githubSyncJob.update({ where: { id: job.id }, data: { state: known.category === "auth" || known.category === "access" || job.attempts >= 4 ? "error" : "queued",
        error: known.message, attempts: { increment: 1 }, nextAttemptAt: retryAt } });
      if (job.repositoryId && known.category === "access") await tx.githubRepository.updateMany({ where: { id: job.repositoryId, tenantId: connection.tenantId, connectionId: connection.id },
        data: { accessible: false, accessCheckedAt: new Date(), lastError: known.message } });
    }
  });
}
export async function confirmAccess(connection: Connection, maxRepositories = 3) {
  if (!await allowSync(connection, true)) return;
  await withGithubLease(connection.githubUserId!, async owner => {
    try {
      const client = new GithubClient(await validToken(connection, owner)), db = getPrisma(), threshold = new Date(Date.now() - 300000);
      if (!connection.verifiedAt || connection.verifiedAt < threshold) {
        const viewer = await client.viewer();
        if (viewer.externalId !== connection.githubUserId) throw new GithubError("A identidade GitHub foi alterada. Reconecte a conta.", 401, undefined, "auth");
        await db.$transaction(async tx => { await guardLease(tx, connection, owner); await tx.githubConnection.update({ where: { id: connection.id }, data: { verifiedAt: new Date() } }); });
      }
      const repos = await db.githubRepository.findMany({ where: { tenantId: connection.tenantId, connectionId: connection.id, selected: true,
        OR: [{ accessCheckedAt: null }, { accessCheckedAt: { lt: threshold } }] }, orderBy: { accessCheckedAt: "asc" }, take: maxRepositories });
      for (const repo of repos) {
        try {
          const metadata = repositorySchema.parse((await client.request(repoPath(repo.owner, repo.name))).data);
          if (metadata.node_id !== repo.externalId) throw new GithubError("O repositório foi substituído. Atualize a lista em Integrações.", 403, undefined, "access");
          await db.$transaction(async tx => { await guardLease(tx, connection, owner); await tx.githubRepository.update({ where: { id: repo.id },
            data: { accessible: true, accessCheckedAt: new Date(), lastError: null, owner: metadata.owner.login, name: metadata.name, fullName: metadata.full_name } }); });
        } catch (error) {
          if (!(error instanceof GithubError) || error.category !== "access") throw error;
          await db.$transaction(async tx => { await guardLease(tx, connection, owner); await tx.githubRepository.update({ where: { id: repo.id },
            data: { accessible: false, accessCheckedAt: new Date(), lastError: error.message } }); });
        }
      }
    } catch (error) { await failure(connection, owner, error); throw error; }
  });
}
async function inventoryStep(connection: Connection, job: GithubSyncJob, owner: string, client: GithubClient) {
  const db = getPrisma(), cursor = jobCursor(job), page = Number(cursor.page ?? 1), scanId = String(cursor.scanId);
  const result = await client.page(`/user/repos?affiliation=owner,collaborator,organization_member&visibility=all&per_page=100&sort=full_name&direction=asc&page=${page}`);
  const repos = result.items.map(item => repositorySchema.parse(item));
  await db.$transaction(async tx => {
    await guardLease(tx, connection, owner);
    for (const repo of repos) {
      const data = { owner: repo.owner.login, name: repo.name, fullName: repo.full_name, defaultBranch: repo.default_branch ?? "main",
        private: repo.private, fork: repo.fork, archived: repo.archived, discoveredIn: scanId, accessible: true, accessCheckedAt: new Date(), lastError: null };
      await tx.githubRepository.upsert({ where: { connectionId_externalId: { connectionId: connection.id, externalId: repo.node_id } },
        create: { tenantId: connection.tenantId, connectionId: connection.id, externalId: repo.node_id, ...data }, update: data });
    }
    await tx.githubSyncJob.update({ where: { id: job.id }, data: { state: result.next ? "queued" : "done", cursor: { page: page + 1, scanId },
      ...(result.next ? {} : { coveredFrom: new Date(), coveredThrough: new Date() }), error: null, attempts: 0 } });
    if (!result.next) {
      await tx.githubRepository.updateMany({ where: { connectionId: connection.id, tenantId: connection.tenantId, OR: [{ discoveredIn: null }, { discoveredIn: { not: scanId } }] },
        data: { accessible: false, accessCheckedAt: new Date(), lastError: "O repositório não está mais disponível para esta conta." } });
      await tx.githubConnection.update({ where: { id: connection.id }, data: { inventoryAt: new Date(), verifiedAt: new Date(), lastError: null } });
    }
  }, { timeout: 60000 });
}
const commitListSchema = z.array(z.object({ sha: z.string().regex(/^[a-f\d]{40,64}$/i) }).passthrough()).max(100);
async function resourceStep(connection: Connection, job: GithubSyncJob, repo: GithubRepository, owner: string, client: GithubClient) {
  const db = getPrisma(); let cursor = jobCursor(job);
  if (!cursor.since) {
    cursor = job.resource === "REVIEW" ? { ...cursor, page: 1, since: historyStart().toISOString(), until: new Date().toISOString() } : initialWindow(job);
    await db.$transaction(async tx => { await guardLease(tx, connection, owner); await tx.githubSyncJob.update({ where: { id: job.id }, data: { cursor: cursor as Prisma.InputJsonObject } }); });
    return;
  }
  const base = repoPath(repo.owner, repo.name), since = new Date(String(cursor.since)), until = new Date(String(cursor.until));
  if (job.resource === "COMMIT" && !cursor.head) {
    let head: string | null = null;
    try { head = commitListSchema.parse((await client.request(`${base}/commits?sha=${encodeURIComponent(repo.defaultBranch)}&per_page=1`)).data)[0]?.sha ?? null; }
    catch (error) { if (!(error instanceof GithubError) || error.status !== 409) throw error; }
    if (!head) { await finishResource(connection, job, repo, owner, { ...cursor, empty: true }, [], false); return; }
    cursor = { ...cursor, head, branch: repo.defaultBranch, compare: cursor.phase === "incremental" && typeof cursor.lastHead === "string" };
    await db.$transaction(async tx => { await guardLease(tx, connection, owner); await tx.githubSyncJob.update({ where: { id: job.id }, data: { cursor: cursor as Prisma.InputJsonObject } }); });
    return;
  }
  const page = Number(cursor.page ?? 1); let items: unknown[], next: boolean;
  if (job.resource === "COMMIT" && cursor.compare) {
    try {
      const result = await client.request(`${base}/compare/${encodeURIComponent(String(cursor.lastHead))}...${encodeURIComponent(String(cursor.head))}?per_page=100&page=${page}`);
      const comparison = z.object({ status: z.enum(["ahead", "behind", "diverged", "identical"]), commits: z.array(z.unknown()).max(100) }).parse(result.data);
      if (comparison.status === "behind" || comparison.status === "diverged") {
        await resetCommitScan(connection, job, owner, cursor); return;
      }
      items = comparison.commits; next = hasNext(result.headers, items.length);
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 409 || error.status === 422)) { await resetCommitScan(connection, job, owner, cursor); return; }
      throw error;
    }
  } else {
    const params = new URLSearchParams({ per_page: "100", page: String(page) });
    let path: string;
    if (job.resource === "COMMIT") {
      params.set("sha", String(cursor.head)); params.set("since", since.toISOString()); params.set("until", until.toISOString()); path = `${base}/commits`;
    } else if (job.resource === "REVIEW") path = `${base}/pulls/${Number(cursor.pullNumber)}/reviews`;
    else if (job.resource === "ISSUE") {
      params.set("state", "all"); params.set("sort", "updated"); params.set("direction", "desc"); params.set("since", since.toISOString()); path = `${base}/issues`;
    } else { params.set("state", "all"); params.set("sort", "updated"); params.set("direction", "desc"); path = `${base}/pulls`; }
    const result = await client.page(`${path}?${params}`); items = result.items; next = result.next;
  }
  if (job.resource === "PULL_REQUEST") {
    const updates = z.array(z.object({ updated_at: z.string().datetime({ offset: true }) })).parse(items);
    const cutoff = updates.findIndex(row => new Date(row.updated_at) < since);
    if (cutoff >= 0) { items = items.slice(0, cutoff); next = false; }
  }
  const contributions = items.map(item => normalize(item, job.resource as ContributionType)).filter(item => item !== null && item.occurredAt >= historyStart() && item.occurredAt <= until);
  await finishResource(connection, job, repo, owner, cursor, contributions, next, items);
}
async function resetCommitScan(connection: Connection, job: GithubSyncJob, owner: string, cursor: Record<string, Prisma.JsonValue>) {
  await getPrisma().$transaction(async tx => {
    await guardLease(tx, connection, owner);
    await tx.githubSyncJob.update({ where: { id: job.id }, data: { cursor: { ...cursor, compare: false, phase: "full", page: 1, scanId: randomUUID(), since: historyStart().toISOString() } } });
  });
}
async function finishResource(connection: Connection, job: GithubSyncJob, repo: GithubRepository, owner: string,
  cursor: Record<string, Prisma.JsonValue>, contributions: ReturnType<typeof normalize>[], next: boolean, rawItems: unknown[] = []) {
  const until = new Date(String(cursor.until)), since = new Date(String(cursor.since));
  await getPrisma().$transaction(async tx => {
    await guardLease(tx, connection, owner);
    const selected = await tx.githubRepository.findFirst({ where: { id: repo.id, tenantId: connection.tenantId, connectionId: connection.id, selected: true } });
    const active = await tx.tenantIntegration.findUnique({ where: { id: connection.integrationId }, select: { enabled: true } });
    if (!selected || !active?.enabled) throw new GithubError("A sincronização foi pausada.", 409);
    await persistContributions(tx, connection, repo.id, contributions.filter(item => item !== null), job.resource === "COMMIT" && !cursor.compare ? String(cursor.scanId) : undefined);
    if (job.resource === "PULL_REQUEST") {
      for (const raw of rawItems) {
        const pr = z.object({ number: z.number().int().positive() }).parse(raw);
        await queueResource(tx, connection, repo.id, "REVIEW", `${repo.id}:REVIEW:${pr.number}`, pr.number);
      }
      if (!next) await tx.githubSyncJob.updateMany({ where: { tenantId: connection.tenantId, connectionId: connection.id, repositoryId: repo.id, resource: "REVIEW", state: "done" }, data: { coveredThrough: until } });
    }
    const recent = cursor.phase === "recent";
    if (!next && job.resource === "COMMIT" && !cursor.compare) {
      await tx.githubContribution.updateMany({ where: { tenantId: connection.tenantId, repositoryId: repo.id, type: "COMMIT", current: true,
        occurredAt: { gte: since, lte: until }, OR: [{ seenIn: null }, { seenIn: { not: String(cursor.scanId) } }] }, data: { current: false } });
      await rebuildDaily(tx, connection.tenantId, repo.id);
    }
    const cursorNext = next ? { ...cursor, page: Number(cursor.page ?? 1) + 1 } : recent ? {
      phase: "full", page: 1, scanId: randomUUID(), since: historyStart(until).toISOString(), until: until.toISOString(),
    } : { lastHead: cursor.head ?? cursor.lastHead ?? null, lastFullAt: cursor.phase === "full" ? until.toISOString() : cursor.lastFullAt ?? null, pullNumber: cursor.pullNumber ?? null };
    await tx.githubSyncJob.update({ where: { id: job.id }, data: { cursor: cursorNext as Prisma.InputJsonObject, state: next || recent ? "queued" : "done", priority: !next && recent ? 15 : job.priority,
      error: null, attempts: 0, ...(next ? {} : { coveredFrom: cursor.phase === "incremental" && job.coveredFrom ? job.coveredFrom : since, coveredThrough: until }) } });
    await tx.githubRepository.update({ where: { id: repo.id }, data: { accessible: true, accessCheckedAt: new Date(), lastError: null } });
  }, { timeout: 60000 });
}
export async function processConnection(tenantId: string, options: { milliseconds?: number; steps?: number; trigger?: "MANUAL" | "CRON" } = {}) {
  const connection = await getConnection(tenantId);
  if (!connection || !await allowSync(connection)) return { steps: 0, skipped: true };
  const pending = await getPrisma().githubSyncJob.count({ where: { tenantId, connectionId: connection.id, generation: connection.generation,
    state: "queued", nextAttemptAt: { lte: new Date() }, ...(!connection.integration.enabled ? { resource: "INVENTORY" } : {}) } });
  if (!pending) return { steps: 0, skipped: true };
  return withGithubLease(connection.githubUserId!, async owner => {
    const runId = await abrirExecucao({ tenantId, integrationId: connection.integrationId, trigger: options.trigger ?? "MANUAL" });
    const end = Date.now() + (options.milliseconds ?? 18000), maximum = options.steps ?? 12;
    let steps = 0, issue: string | null = null;
    try {
      const client = new GithubClient(await validToken(connection, owner));
      while (steps < maximum && Date.now() < end) {
        const job = await getPrisma().githubSyncJob.findFirst({ where: { tenantId, connectionId: connection.id, generation: connection.generation, state: "queued", nextAttemptAt: { lte: new Date() },
          ...(!connection.integration.enabled ? { resource: "INVENTORY" } : {}) }, orderBy: [{ priority: "asc" }, { updatedAt: "asc" }, { id: "asc" }] });
        if (!job) break;
        try {
          if (job.resource === "INVENTORY") await inventoryStep(connection, job, owner, client);
          else {
            const repo = await getPrisma().githubRepository.findFirst({ where: { id: job.repositoryId!, tenantId, connectionId: connection.id, selected: true } });
            if (!repo) { await getPrisma().$transaction(async tx => { await guardLease(tx, connection, owner); await tx.githubSyncJob.update({ where: { id: job.id }, data: { state: "canceled" } }); }); }
            else await resourceStep(connection, job, repo, owner, client);
          }
        } catch (error) {
          await failure(connection, owner, error, job);
          issue = error instanceof GithubError ? error.message : "Lote GitHub não confirmado.";
          if (!(error instanceof GithubError) || error.category !== "access") break;
        }
        steps++;
      }
      if (!issue) {
        const outstanding = await getPrisma().githubSyncJob.findFirst({ where: { tenantId, connectionId: connection.id, generation: connection.generation,
          state: { in: ["queued", "error"] }, error: { not: null } }, select: { error: true }, orderBy: { updatedAt: "desc" } });
        issue = outstanding?.error ?? null;
        await getPrisma().$transaction(async tx => { await guardLease(tx, connection, owner); await tx.githubConnection.update({ where: { id: connection.id }, data: { lastError: issue } }); });
      }
    } catch (error) { await failure(connection, owner, error); issue = error instanceof GithubError ? error.message : "GitHub indisponível."; }
    finally {
      await encerrarExecucao({ runId, integrationId: connection.integrationId, desfecho: issue ? { ok: false, erro: issue } : { ok: true, counters: { steps } } });
    }
    return { steps, ...(issue ? { error: issue } : {}) };
  });
}
export async function processGithubCron() {
  const db = getPrisma(), deadline = Date.now() + 22000;
  const connections = await db.githubConnection.findMany({ where: { status: "connected", integration: { integrationCode: "github", instanceKey: "default" },
    AND: [{ OR: [{ integration: { enabled: true } }, { jobs: { some: { state: "queued", resource: "INVENTORY", nextAttemptAt: { lte: new Date() } } } }] }],
    OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: new Date() } }, { jobs: { some: { state: "queued", nextAttemptAt: { lte: new Date() } } } }] }, orderBy: { updatedAt: "asc" }, take: 10, include: { integration: true } });
  const results: { tenantId: string; steps?: number; error?: string }[] = [];
  for (const connection of connections) {
    if (Date.now() >= deadline) break;
    try {
      await scheduleSync(connection);
      const result = await processConnection(connection.tenantId, { milliseconds: Math.min(10000, deadline - Date.now()), steps: 6, trigger: "CRON" });
      results.push({ tenantId: connection.tenantId, ...result });
    } catch (error) { results.push({ tenantId: connection.tenantId, error: error instanceof GithubError ? error.message : "Falha na conexão GitHub." }); }
  }
  return { ok: true, connections: results };
}
