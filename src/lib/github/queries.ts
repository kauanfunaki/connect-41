import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { emptyCounts, GithubError, period, type Filters } from "./rules";
import { getConnection } from "./store";
import { CONTRIBUTION_TYPES, type ContributionType, type DashboardView, type DayEvent, type HeatmapUser } from "./types";

async function readable(tenantId: string) {
  const connection = await getConnection(tenantId);
  // Leitura local do acervo gravado (26/10/2026). Exigir confirmação de acesso dos
  // últimos cinco minutos escondia os dados até o executor passar; agora só sai da
  // tela o repositório marcado sem acesso ou a conexão que pede reconexão.
  const selected = connection?.status === "connected" ? await getPrisma().githubRepository.findMany({ where: { tenantId, connectionId: connection.id, selected: true },
    orderBy: { id: "asc" }, select: { id: true, owner: true, accessible: true } }) : [];
  return { connection, repositories: selected.filter(repo => repo.accessible).map(({ id, owner }) => ({ id, owner })), selected: selected.length };
}
export async function dashboard(tenantId: string, filters: Filters): Promise<DashboardView> {
  const db = getPrisma(), access = await readable(tenantId), { connection } = access;
  const timezone = connection?.timezone ?? "America/Sao_Paulo", dates = period(filters, new Date(), timezone), pageSize = 20;
  const repositories = access.repositories.filter(repo => (!filters.repository || repo.id === filters.repository) && (!filters.organization || repo.owner.toLowerCase() === filters.organization.toLowerCase()));
  if (filters.repository && !access.repositories.some(repo => repo.id === filters.repository)) throw new GithubError("Repositório indisponível para consulta. Confira a conexão e a seleção.", 403);
  const base: DashboardView = { ...dates, connected: connection?.status === "connected", enabled: connection?.integration.enabled ?? false,
    login: connection?.login ?? null, timezone, message: null, users: [], totalUsers: 0, page: 1, pageSize, unidentified: 0, total: 0, summary: null };
  if (!connection || connection.status !== "connected") return { ...base, message: connection?.lastError ?? "Conecte uma conta GitHub em Integrações." };
  if (!access.selected) return { ...base, message: "Selecione os repositórios em Integrações para iniciar a coleta." };
  if (!access.repositories.length) return { ...base, message: "Os repositórios selecionados estão sem acesso no GitHub. Confira em Integrações." };
  if (!repositories.length) return base;
  const repoIds = repositories.map(repo => repo.id);
  const common = { tenantId, repositoryId: { in: repoIds }, day: { gte: dates.from, lte: dates.to }, count: { gt: 0 }, type: filters.type ?? { in: [...CONTRIBUTION_TYPES] } } satisfies Prisma.GithubDailyContributionWhereInput;
  const userFilter = { connectionId: connection.id, tenantId, unidentified: false, ...(filters.bots === "0" ? { isBot: false } : {}), ...(filters.user ? { login: { contains: filters.user } } : {}) };
  // Mantém pessoas sem atividade no período, sem revelar autores de repositórios
  // removidos ou sem acesso. Usuários acompanhados são cadastros explícitos.
  const whereUser = { ...userFilter, OR: [{ tracked: true }, { daily: { some: { ...common, day: undefined } } }] } satisfies Prisma.GithubUserWhereInput;
  const [totalUsers, total, unidentified] = await Promise.all([
    db.githubUser.count({ where: whereUser }),
    db.githubDailyContribution.aggregate({ where: { ...common, user: userFilter }, _sum: { count: true } }),
    db.githubDailyContribution.aggregate({ where: { ...common, user: { connectionId: connection.id, unidentified: true } }, _sum: { count: true } }),
  ]);
  if (filters.view === "general") {
    const [daily, activity, recent] = await Promise.all([
      db.githubDailyContribution.groupBy({ by: ["day", "type"], where: { ...common, user: userFilter }, orderBy: { day: "asc" }, _sum: { count: true } }),
      db.githubDailyContribution.groupBy({ by: ["userId"], where: { ...common, user: userFilter }, _sum: { count: true }, orderBy: [{ _sum: { count: "desc" } }, { userId: "asc" }] }),
      db.githubContribution.findMany({ where: { tenantId, repositoryId: { in: repoIds }, day: common.day, current: true, user: userFilter, ...(filters.type ? { type: filters.type } : {}) },
        orderBy: [{ occurredAt: "desc" }, { id: "asc" }], take: 8,
        select: { id: true, type: true, url: true, externalId: true, occurredAt: true, number: true, repository: { select: { fullName: true } }, user: { select: { login: true } } } }),
    ]);
    const counts = emptyCounts(), byDay = new Map<string, ReturnType<typeof emptyCounts>>();
    for (const row of daily) {
      const type = row.type as ContributionType, count = row._sum.count ?? 0, day = byDay.get(row.day) ?? emptyCounts();
      counts[type] += count; day[type] += count; byDay.set(row.day, day);
    }
    const leaders = activity.slice(0, 4);
    const people = await db.githubUser.findMany({ where: { ...userFilter, id: { in: leaders.map(row => row.userId) } }, select: { id: true, login: true } });
    const names = new Map(people.map(person => [person.id, person.login]));
    return { ...base, totalUsers, total: total._sum.count ?? 0, unidentified: unidentified._sum.count ?? 0,
      summary: { counts, activeDevelopers: activity.length, days: [...byDay].map(([day, counts]) => ({ day, counts })),
        leaders: leaders.flatMap(row => names.has(row.userId) ? [{ id: row.userId, login: names.get(row.userId)!, total: row._sum.count ?? 0 }] : []),
        recent: recent.map(row => ({ id: row.id, type: row.type as ContributionType, url: row.url, occurredAt: row.occurredAt.toISOString(), number: row.number,
          repository: row.repository.fullName, login: row.user.login, reference: row.type === "COMMIT" ? row.externalId.slice(0, 7) : row.number ? `#${row.number}` : "Revisão" })) } };
  }
  const page = Math.min(filters.page, Math.max(1, Math.ceil(totalUsers / pageSize)));
  const users = await db.githubUser.findMany({ where: whereUser, orderBy: [{ login: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
    select: { id: true, login: true, isBot: true, tracked: true } });
  // Totais por tipo e calendário por dia em consultas separadas: o calendário não
  // precisa do tipo, e agrupar pelos três multiplicava as linhas por até quatro.
  const where = { ...common, userId: { in: users.map(user => user.id) } };
  const [types, days] = await Promise.all([
    db.githubDailyContribution.groupBy({ by: ["userId", "type"], where, _sum: { count: true } }),
    db.githubDailyContribution.groupBy({ by: ["userId", "day"], where, orderBy: [{ userId: "asc" }, { day: "asc" }], _sum: { count: true } }),
  ]);
  const byUser = new Map(users.map(user => [user.id, { counts: emptyCounts(), days: [] as { day: string; count: number }[] }]));
  for (const row of types) { const entry = byUser.get(row.userId); if (entry) entry.counts[row.type as ContributionType] += row._sum.count ?? 0; }
  for (const row of days) byUser.get(row.userId)?.days.push({ day: row.day, count: row._sum.count ?? 0 });
  const result: HeatmapUser[] = users.map(user => {
    const { counts, days } = byUser.get(user.id)!;
    return { ...user, counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0), activeDays: days.length, days };
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
  return { events, total, page, pageSize: 50 };
}
