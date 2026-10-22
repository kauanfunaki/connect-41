import { getPrisma } from "@/lib/prisma";
import { getConnection } from "./store";
import { githubSchedulerEnabled } from "./scheduler";
import type { SyncProgress } from "./types";

export async function syncProgress(connection: NonNullable<Awaited<ReturnType<typeof getConnection>>>): Promise<SyncProgress> {
  const db = getPrisma(), now = new Date();
  const [groups, lease] = await Promise.all([
    db.githubSyncJob.groupBy({ by: ["state"], where: { tenantId: connection.tenantId, connectionId: connection.id, generation: connection.generation, state: { not: "canceled" },
      ...(!connection.integration.enabled ? { resource: "INVENTORY" } : {}) }, _count: { _all: true }, _min: { nextAttemptAt: true }, _max: { updatedAt: true } }),
    connection.githubUserId ? db.githubAccountLease.findUnique({ where: { githubUserId: connection.githubUserId }, select: { owner: true, expiresAt: true, nextAttemptAt: true } }) : null,
  ]);
  const queued = groups.find(group => group.state === "queued"), failed = groups.find(group => group.state === "error")?._count._all ?? 0;
  const pending = queued?._count._all ?? 0, done = groups.find(group => group.state === "done")?._count._all ?? 0;
  const retry = [queued?._min.nextAttemptAt, lease?.nextAttemptAt].filter((date): date is Date => Boolean(date && date > now));
  const nextAttemptAt = pending && retry.length ? new Date(Math.max(...retry.map(date => date.getTime()))).toISOString() : null;
  const dates = groups.flatMap(group => group._max.updatedAt ? [group._max.updatedAt.getTime()] : []);
  const state = connection.status !== "connected" ? "disconnected" : !connection.integration.enabled && !pending ? "paused"
    : lease?.owner && lease.expiresAt && lease.expiresAt > now ? "processing" : pending ? nextAttemptAt ? "waiting" : "queued" : failed ? "error" : "idle";
  return { state, automatic: githubSchedulerEnabled(), done, pending, failed, total: done + pending + failed,
    lastActivityAt: dates.length ? new Date(Math.max(...dates)).toISOString() : null, nextAttemptAt };
}
