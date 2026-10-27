import { randomUUID } from "node:crypto";
import { Prisma, type GithubConnection, type GithubRepository, type GithubSyncJob } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { dayAt, GithubError, historyStart } from "./rules";
import type { Contribution } from "./types";

export type GithubDb = Prisma.TransactionClient;
export const connectionQuery = (tenantId: string) => ({ tenantId, integration: { integrationCode: "github", instanceKey: "default" } });
export function getConnection(tenantId: string) {
  return getPrisma().githubConnection.findFirst({ where: connectionQuery(tenantId), include: { integration: true } });
}
export async function ensureConnection(tenantId: string) {
  const db = getPrisma();
  const integration = await db.tenantIntegration.upsert({ where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "github", instanceKey: "default" } },
    create: { tenantId, integrationCode: "github", instanceKey: "default", enabled: false, configEnc: encryptSecret("{}") }, update: {}, select: { id: true } });
  return db.githubConnection.upsert({ where: { integrationId: integration.id }, create: { tenantId, integrationId: integration.id }, update: {} });
}
export async function guardGeneration(tx: GithubDb, connection: Pick<GithubConnection, "id" | "tenantId" | "generation">) {
  const result = await tx.githubConnection.updateMany({ where: { id: connection.id, tenantId: connection.tenantId, generation: connection.generation, status: "connected" }, data: { updatedAt: new Date() } });
  if (result.count !== 1) throw new GithubError("A conexão foi pausada ou alterada. Atualize a tela.", 409);
}
export async function queueInventory(db: GithubDb, connection: Pick<GithubConnection, "id" | "tenantId" | "generation">) {
  const old = await db.githubSyncJob.findUnique({ where: { connectionId_key: { connectionId: connection.id, key: "inventory" } } });
  if (old?.state === "queued" && old.generation === connection.generation) return;
  const data = { generation: connection.generation, state: "queued", priority: 0, cursor: { page: 1, scanId: randomUUID() }, nextAttemptAt: new Date(), attempts: 0, error: null };
  await db.githubSyncJob.upsert({ where: { connectionId_key: { connectionId: connection.id, key: "inventory" } },
    create: { tenantId: connection.tenantId, connectionId: connection.id, key: "inventory", resource: "INVENTORY", ...data }, update: data });
}
export async function queueResource(db: GithubDb, connection: Pick<GithubConnection, "id" | "tenantId" | "generation">, repositoryId: string,
  resource: string, key = `${repositoryId}:${resource}`, pullNumber?: number, forceFull = false) {
  const old = await db.githubSyncJob.findUnique({ where: { connectionId_key: { connectionId: connection.id, key } } });
  if (old?.state === "queued" && old.generation === connection.generation) return;
  const cursor = old?.cursor && typeof old.cursor === "object" && !Array.isArray(old.cursor) ? old.cursor as Record<string, Prisma.JsonValue> : {};
  // A atualização completa pedida ou interrompida no meio sobrevive a pausar/retomar.
  const keep = { lastHead: typeof cursor.lastHead === "string" ? cursor.lastHead : undefined, pullNumber, forceFull: forceFull || cursor.forceFull === true || cursor.phase === "full" || undefined };
  const cleaned = JSON.parse(JSON.stringify(keep)) as Prisma.InputJsonObject;
  const data = { generation: connection.generation, state: "queued", priority: resource === "REVIEW" ? 4 : old?.coveredFrom ? 10 : 2,
    cursor: cleaned, nextAttemptAt: new Date(), attempts: 0, error: null };
  await db.githubSyncJob.upsert({ where: { connectionId_key: { connectionId: connection.id, key } },
    create: { tenantId: connection.tenantId, connectionId: connection.id, repositoryId, key, resource, ...data }, update: data });
}
export async function queueRepositories(db: GithubDb, connection: Pick<GithubConnection, "id" | "tenantId" | "generation">, repositories: Pick<GithubRepository, "id">[], forceFull = false) {
  for (const repo of repositories) for (const resource of ["COMMIT", "ISSUE", "PULL_REQUEST"]) await queueResource(db, connection, repo.id, resource, undefined, undefined, forceFull);
  const reviews = await db.githubSyncJob.findMany({ where: { connectionId: connection.id, tenantId: connection.tenantId,
    repositoryId: { in: repositories.map(repo => repo.id) }, resource: "REVIEW", state: { in: ["canceled", "error"] } } });
  for (const review of reviews) {
    const pullNumber = Number(jobCursor(review).pullNumber);
    if (Number.isInteger(pullNumber) && pullNumber > 0) await queueResource(db, connection, review.repositoryId!, "REVIEW", review.key, pullNumber);
  }
}
export async function rebuildDaily(db: GithubDb, tenantId: string, repositoryId: string) {
  const grouped = await db.githubContribution.groupBy({ by: ["userId", "day", "type"], where: { tenantId, repositoryId, current: true }, _count: { _all: true } });
  await db.githubDailyContribution.deleteMany({ where: { tenantId, repositoryId } });
  if (grouped.length) await db.githubDailyContribution.createMany({ data: grouped.map(row => ({ tenantId, repositoryId, userId: row.userId, day: row.day, type: row.type, count: row._count._all })) });
}
export async function persistContributions(db: GithubDb, connection: GithubConnection, repositoryId: string, items: Contribution[], scanId?: string) {
  const touched = new Map<string, { userId: string; day: string; type: string }>();
  for (const item of items) {
    const user = await db.githubUser.upsert({ where: { connectionId_externalId: { connectionId: connection.id, externalId: item.user.externalId } },
      create: { tenantId: connection.tenantId, connectionId: connection.id, ...item.user },
      update: { login: item.user.login, isBot: item.user.isBot, unidentified: item.user.unidentified }, select: { id: true } });
    const day = dayAt(item.occurredAt, connection.timezone);
    const old = await db.githubContribution.findUnique({ where: { repositoryId_type_externalId: { repositoryId, type: item.type, externalId: item.externalId } }, select: { userId: true, day: true, type: true } });
    if (old) touched.set(`${old.userId}:${old.day}:${old.type}`, old);
    touched.set(`${user.id}:${day}:${item.type}`, { userId: user.id, day, type: item.type });
    const values = { userId: user.id, day, occurredAt: item.occurredAt, url: item.url, number: item.number, title: item.title, current: true, ...(scanId ? { seenIn: scanId } : {}) };
    await db.githubContribution.upsert({ where: { repositoryId_type_externalId: { repositoryId, type: item.type, externalId: item.externalId } },
      create: { tenantId: connection.tenantId, repositoryId, type: item.type, externalId: item.externalId, ...values }, update: values });
  }
  if (!touched.size) return;
  const grouped = await db.githubContribution.groupBy({ by: ["userId", "day", "type"],
    where: { tenantId: connection.tenantId, repositoryId, current: true, OR: [...touched.values()] }, _count: { _all: true } });
  const counts = new Map(grouped.map(row => [`${row.userId}:${row.day}:${row.type}`, row._count._all]));
  for (const [key, group] of touched) await db.githubDailyContribution.upsert({ where: { repositoryId_userId_day_type: { repositoryId, ...group } },
    create: { tenantId: connection.tenantId, repositoryId, ...group, count: counts.get(key) ?? 0 }, update: { count: counts.get(key) ?? 0 } });
}
export function jobCursor(job: GithubSyncJob): Record<string, Prisma.JsonValue> {
  return job.cursor && typeof job.cursor === "object" && !Array.isArray(job.cursor) ? job.cursor as Record<string, Prisma.JsonValue> : {};
}
export function initialWindow(job: GithubSyncJob, now = new Date()) {
  const { forceFull, ...cursor } = jobCursor(job);
  // O histórico de 12 meses só é percorrido na primeira coleta do repositório ou quando
  // a pessoa força em Integrações; a rotina busca apenas as alterações, com um dia de
  // sobreposição. A reconciliação semanal de todos os repositórios saiu (26/10/2026).
  const full = !job.coveredFrom || !job.coveredThrough || forceFull === true;
  const recent = !job.coveredFrom && cursor.phase !== "full";
  return { ...cursor, page: 1, scanId: randomUUID(), phase: recent ? "recent" : full ? "full" : "incremental",
    since: (recent ? new Date(now.getTime() - 30 * 86400000) : full ? historyStart(now) : new Date(job.coveredThrough!.getTime() - 86400000)).toISOString(),
    until: now.toISOString() };
}
