import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { dayAt, emptyCounts, GithubError, period, type Filters } from "./rules";
import { getConnection } from "./store";
import { syncProgress } from "./progress";
import { CONTRIBUTION_TYPES, type ContributionType, type DashboardView, type DayEvent, type HeatmapUser } from "./types";

async function readable(tenantId: string) {
  const connection = await getConnection(tenantId);
  // Leitura local: o worker revalida o acesso. Nunca servir dados cuja
  // confirmação expirou, mesmo se o executor estiver parado.
  const threshold = new Date(Date.now() - 300000);
  const available = connection?.status === "connected" && connection.verifiedAt && connection.verifiedAt >= threshold;
  const repositories = available ? await getPrisma().githubRepository.findMany({ where: { tenantId, connectionId: connection!.id, selected: true, accessible: true, accessCheckedAt: { gte: threshold } },
    select: { id: true, fullName: true, owner: true } }) : [];
  const selected = connection ? await getPrisma().githubRepository.count({ where: { tenantId, connectionId: connection.id, selected: true } }) : 0;
  return { connection, repositories, message: null as string | null, unavailable: selected - repositories.length };
}
export async function dashboard(tenantId: string, filters: Filters): Promise<DashboardView> {
  const db = getPrisma(), access = await readable(tenantId), { connection } = access;
  const timezone = connection?.timezone ?? "America/Sao_Paulo", dates = period(filters, new Date(), timezone), pageSize = 20;
  const repositories = access.repositories.filter(repo => (!filters.repository || repo.id === filters.repository) && (!filters.organization || repo.owner.toLowerCase() === filters.organization.toLowerCase()));
  if (filters.repository && !access.repositories.some(repo => repo.id === filters.repository)) throw new GithubError("Repositório indisponível para consulta. Confira a conexão e a seleção.", 403);
  const base: DashboardView = { ...dates, connected: connection?.status === "connected", enabled: connection?.integration.enabled ?? false,
    login: connection?.login ?? null, timezone, complete: false, coveredThrough: null, pending: 0, failed: 0, message: access.message,
    users: [], totalUsers: 0, page: 1, pageSize, repositories: access.repositories, unavailable: access.unavailable, unidentified: 0, total: 0, progress: null };
  if (!connection || connection.status !== "connected") return { ...base, message: connection?.lastError ?? "Conecte uma conta GitHub em Integrações." };
  const [jobs, progress] = await Promise.all([
    db.githubSyncJob.groupBy({ by: ["repositoryId", "resource", "state"], where: { tenantId, connectionId: connection.id, ...(connection.integration.enabled ? { state: { not: "canceled" } } : {}) },
      _count: { _all: true, coveredFrom: true, coveredThrough: true }, _min: { coveredFrom: true, coveredThrough: true }, _max: { coveredFrom: true } }),
    syncProgress(connection),
  ]);
  base.progress = progress; base.pending = progress.pending; base.failed = progress.failed;
  if (!repositories.length) return { ...base, message: access.message ?? (access.unavailable ? "Confirmando o acesso aos repositórios selecionados. Atualize em instantes." : "Selecione os repositórios em Integrações para iniciar a coleta.") };
  const repoIds = repositories.map(repo => repo.id);
  const covered = jobs.filter(job => job.repositoryId && repoIds.includes(job.repositoryId) && job.resource !== "INVENTORY");
  const required = repositories.every(repo => ["COMMIT", "ISSUE", "PULL_REQUEST"].every(resource => covered.some(job => job.repositoryId === repo.id && job.resource === resource)));
  base.complete = required && !access.unavailable && covered.every(job => (job.state === "done" || !connection.integration.enabled && job.state === "canceled") && job._count.coveredFrom === job._count._all && job._count.coveredThrough === job._count._all
    && job._max.coveredFrom && dayAt(job._max.coveredFrom, timezone) < dates.from && job._min.coveredThrough && dayAt(job._min.coveredThrough, timezone) >= dates.to);
  const ends = covered.flatMap(job => job._min.coveredThrough && job._count.coveredThrough === job._count._all ? [job._min.coveredThrough.getTime()] : []);
  base.coveredThrough = ends.length === covered.length && ends.length ? new Date(Math.min(...ends)).toISOString() : null;
  base.message ??= connection.lastError;
  const common = { tenantId, repositoryId: { in: repoIds }, day: { gte: dates.from, lte: dates.to }, count: { gt: 0 }, ...(filters.type ? { type: filters.type } : {}) } satisfies Prisma.GithubDailyContributionWhereInput;
  const userFilter = { connectionId: connection.id, tenantId, unidentified: false, ...(filters.bots === "0" ? { isBot: false } : {}), ...(filters.user ? { login: { contains: filters.user } } : {}) };
  const whereUser = { ...userFilter, OR: [{ tracked: true }, { daily: { some: common } }] } satisfies Prisma.GithubUserWhereInput;
  const totalUsers = await db.githubUser.count({ where: whereUser }), page = Math.min(filters.page, Math.max(1, Math.ceil(totalUsers / pageSize)));
  const users = await db.githubUser.findMany({ where: whereUser, orderBy: [{ login: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
    select: { id: true, login: true, isBot: true, tracked: true } });
  const [days, total, unidentified] = await Promise.all([
    db.githubDailyContribution.groupBy({ by: ["userId", "day", "type"], where: { ...common, userId: { in: users.map(user => user.id) } }, _sum: { count: true } }),
    db.githubDailyContribution.aggregate({ where: { ...common, user: userFilter }, _sum: { count: true } }),
    db.githubDailyContribution.aggregate({ where: { ...common, user: { connectionId: connection.id, unidentified: true } }, _sum: { count: true } }),
  ]);
  const byUser = new Map<string, typeof days>();
  for (const row of days) { const rows = byUser.get(row.userId) ?? []; rows.push(row); byUser.set(row.userId, rows); }
  const result: HeatmapUser[] = users.map(user => {
    const rows = byUser.get(user.id) ?? [], counts = emptyCounts(), daily = new Map<string, number>();
    for (const row of rows) {
      if (!CONTRIBUTION_TYPES.includes(row.type as ContributionType)) continue;
      const count = row._sum.count ?? 0; counts[row.type as ContributionType] += count; daily.set(row.day, (daily.get(row.day) ?? 0) + count);
    }
    return { ...user, counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0), activeDays: daily.size, days: [...daily].map(([day, count]) => ({ day, count })) };
  });
  return { ...base, users: result, totalUsers, page, total: total._sum.count ?? 0, unidentified: unidentified._sum.count ?? 0 };
}
export async function dayEvents(tenantId: string, filters: Filters, userId: string, day: string, page: number) {
  const access = await readable(tenantId), ids = access.repositories.filter(repo => (!filters.repository || repo.id === filters.repository) && (!filters.organization || repo.owner.toLowerCase() === filters.organization.toLowerCase())).map(repo => repo.id);
  if (!access.connection || access.connection.status !== "connected" || !ids.length) throw new GithubError("Confirme o acesso aos repositórios antes de consultar os eventos.", 403);
  const where = { tenantId, userId, day, current: true, repositoryId: { in: ids }, ...(filters.type ? { type: filters.type } : {}),
    user: { connectionId: access.connection.id, unidentified: false, ...(filters.bots === "0" ? { isBot: false } : {}) } } satisfies Prisma.GithubContributionWhereInput;
  const [total, rows] = await Promise.all([getPrisma().githubContribution.count({ where }), getPrisma().githubContribution.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "asc" }], skip: (page - 1) * 50, take: 50,
    select: { id: true, type: true, url: true, occurredAt: true, number: true, repository: { select: { fullName: true } }, user: { select: { login: true } } } })]);
  const events: DayEvent[] = rows.map(row => ({ ...row, type: row.type as ContributionType, occurredAt: row.occurredAt.toISOString(), repository: row.repository.fullName, login: row.user.login }));
  return { events, total, page, pageSize: 50, partial: access.unavailable > 0 };
}
