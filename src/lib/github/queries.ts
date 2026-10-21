import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { dayAt, emptyCounts, GithubError, period, type Filters } from "./rules";
import { getConnection } from "./store";
import { confirmAccess } from "./sync";
import { CONTRIBUTION_TYPES, type ContributionType, type DashboardView, type DayEvent, type HeatmapUser } from "./types";

async function readable(tenantId: string) {
  let connection = await getConnection(tenantId), message: string | null = null;
  if (connection?.status === "connected") {
    try { await confirmAccess(connection); }
    catch (error) { message = error instanceof GithubError ? error.message : "Não foi possível confirmar o acesso aos repositórios."; }
    connection = await getConnection(tenantId);
  }
  const threshold = new Date(Date.now() - 300000);
  const available = connection?.status === "connected" && connection.verifiedAt && connection.verifiedAt >= threshold;
  const repositories = available ? await getPrisma().githubRepository.findMany({ where: { tenantId, connectionId: connection!.id, selected: true, accessible: true, accessCheckedAt: { gte: threshold } },
    select: { id: true, fullName: true, owner: true } }) : [];
  const selected = connection ? await getPrisma().githubRepository.count({ where: { tenantId, connectionId: connection.id, selected: true } }) : 0;
  return { connection, repositories, message, unavailable: selected - repositories.length };
}
export async function dashboard(tenantId: string, filters: Filters): Promise<DashboardView> {
  const db = getPrisma(), access = await readable(tenantId), { connection } = access;
  const timezone = connection?.timezone ?? "America/Sao_Paulo", dates = period(filters, new Date(), timezone), pageSize = 20;
  const repositories = access.repositories.filter(repo => (!filters.repository || repo.id === filters.repository) && (!filters.organization || repo.owner.toLowerCase() === filters.organization.toLowerCase()));
  if (filters.repository && !access.repositories.some(repo => repo.id === filters.repository)) throw new GithubError("Repositório indisponível para consulta. Confira a conexão e a seleção.", 403);
  const base: DashboardView = { ...dates, connected: connection?.status === "connected", enabled: connection?.integration.enabled ?? false,
    login: connection?.login ?? null, timezone, complete: false, coveredThrough: null, pending: 0, failed: 0, message: access.message,
    users: [], totalUsers: 0, page: 1, pageSize, repositories: access.repositories, unavailable: access.unavailable, unidentified: 0, total: 0 };
  if (!connection || connection.status !== "connected") return { ...base, message: connection?.lastError ?? "Conecte uma conta GitHub em Integrações." };
  const jobs = await db.githubSyncJob.findMany({ where: { tenantId, connectionId: connection.id },
    select: { repositoryId: true, resource: true, state: true, coveredFrom: true, coveredThrough: true, generation: true } });
  base.pending = jobs.filter(job => job.generation === connection.generation && job.state === "queued" && (connection.integration.enabled || job.resource === "INVENTORY")).length;
  base.failed = jobs.filter(job => job.generation === connection.generation && job.state === "error").length;
  if (!repositories.length) return { ...base, message: access.message ?? (access.unavailable ? "Confirmando o acesso aos repositórios selecionados. Atualize em instantes." : "Selecione os repositórios em Integrações para iniciar a coleta.") };
  const repoIds = repositories.map(repo => repo.id);
  const covered = jobs.filter(job => job.repositoryId && repoIds.includes(job.repositoryId) && job.resource !== "INVENTORY");
  const required = repositories.every(repo => ["COMMIT", "ISSUE", "PULL_REQUEST"].every(resource => covered.some(job => job.repositoryId === repo.id && job.resource === resource)));
  base.complete = required && !access.unavailable && covered.every(job => (job.state === "done" || !connection.integration.enabled && job.state === "canceled") && job.coveredFrom && dayAt(job.coveredFrom, timezone) < dates.from && job.coveredThrough && dayAt(job.coveredThrough, timezone) >= dates.to);
  const ends = covered.flatMap(job => job.coveredThrough ? [job.coveredThrough.getTime()] : []);
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
  const result: HeatmapUser[] = users.map(user => {
    const rows = days.filter(row => row.userId === user.id), counts = emptyCounts(), daily = new Map<string, number>();
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
