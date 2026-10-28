import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { emptyCounts, GithubError, period, type Filters } from "./rules";
import { getConnection } from "./store";
import { linkedPeople } from "./conta";
import { CONTRIBUTION_TYPES, type ContributionType, type DashboardView, type DayEvent, type HeatmapUser, type RepositoryHeatmap, type UnidentifiedAuthor } from "./types";

async function readable(tenantId: string) {
  const connection = await getConnection(tenantId);
  // Leitura local do acervo gravado (26/10/2026). Exigir confirmação de acesso dos
  // últimos cinco minutos escondia os dados até o executor passar; agora só sai da
  // tela o repositório marcado sem acesso ou a conexão que pede reconexão.
  const selected = connection?.status === "connected" ? await getPrisma().githubRepository.findMany({ where: { tenantId, connectionId: connection.id, selected: true },
    orderBy: { id: "asc" }, select: { id: true, owner: true, accessible: true } }) : [];
  return { connection, repositories: selected.filter(repo => repo.accessible).map(({ id, owner }) => ({ id, owner })), selected: selected.length };
}
const reference = (row: { type: string; externalId: string; number: number | null }) => row.type === "COMMIT" ? row.externalId.slice(0, 7) : row.number ? `#${row.number}` : "Revisão";
const eventSelect = { id: true, type: true, url: true, externalId: true, occurredAt: true, number: true, title: true,
  repository: { select: { fullName: true } }, user: { select: { login: true, externalId: true } } } as const;
type EventRow = Prisma.GithubContributionGetPayload<{ select: typeof eventSelect }>;
const toEvent = (row: EventRow, names: Map<string, string>): DayEvent => ({ id: row.id, type: row.type as ContributionType, url: row.url, occurredAt: row.occurredAt.toISOString(),
  repository: row.repository.fullName, login: row.user.login, name: names.get(row.user.externalId) ?? null, number: row.number, reference: reference(row), title: row.title });

export async function dashboard(tenantId: string, filters: Filters): Promise<DashboardView> {
  const db = getPrisma(), [access, names] = await Promise.all([readable(tenantId), linkedPeople(tenantId)]), { connection } = access;
  const timezone = connection?.timezone ?? "America/Sao_Paulo", dates = period(filters, new Date(), timezone), pageSize = 20, all = filters.all === "1";
  const repositories = access.repositories.filter(repo => (!filters.repository || repo.id === filters.repository) && (!filters.organization || repo.owner.toLowerCase() === filters.organization.toLowerCase()));
  if (filters.repository && !access.repositories.some(repo => repo.id === filters.repository)) throw new GithubError("Repositório indisponível para consulta. Confira a conexão e a seleção.", 403);
  const base: DashboardView = { ...dates, connected: connection?.status === "connected", enabled: connection?.integration.enabled ?? false,
    login: connection?.login ?? null, timezone, message: null, users: [], totalUsers: 0, page: 1, pageSize, unidentified: 0, total: 0, summary: null,
    all, linked: names.size, repositories: [], totalRepositories: 0, unidentifiedAuthors: [] };
  if (!connection || connection.status !== "connected") return { ...base, message: connection?.lastError ?? "Conecte uma conta GitHub em Integrações." };
  if (!access.selected) return { ...base, message: "Selecione os repositórios em Integrações para iniciar a coleta." };
  if (!access.repositories.length) return { ...base, message: "Os repositórios selecionados estão sem acesso no GitHub. Confira em Integrações." };
  if (!repositories.length) return base;
  const repoIds = repositories.map(repo => repo.id);
  const common = { tenantId, repositoryId: { in: repoIds }, day: { gte: dates.from, lte: dates.to }, count: { gt: 0 }, type: filters.type ?? { in: [...CONTRIBUTION_TYPES] } } satisfies Prisma.GithubDailyContributionWhereInput;
  // Por padrão só quem vinculou a conta em Sua conta; "Mostrar todos" inclui os demais autores (27/10/2026).
  const userFilter = { connectionId: connection.id, tenantId, unidentified: false, ...(filters.bots === "0" ? { isBot: false } : {}), ...(filters.user ? { login: { contains: filters.user } } : {}),
    ...(all ? {} : { externalId: { in: [...names.keys()] } }) };
  // Mantém pessoas sem atividade no período, sem revelar autores de repositórios
  // removidos ou sem acesso. Usuários acompanhados são cadastros explícitos.
  const whereUser = { ...userFilter, OR: [{ tracked: true }, { daily: { some: { ...common, day: undefined } } }] } satisfies Prisma.GithubUserWhereInput;
  const [totalUsers, total, unidentified] = await Promise.all([
    db.githubUser.count({ where: whereUser }),
    db.githubDailyContribution.aggregate({ where: { ...common, user: userFilter }, _sum: { count: true } }),
    db.githubDailyContribution.groupBy({ by: ["userId", "repositoryId"], where: { ...common, user: { connectionId: connection.id, unidentified: true } }, _sum: { count: true } }),
  ]);
  const totals = { ...base, totalUsers, total: total._sum.count ?? 0, unidentified: unidentified.reduce((sum, row) => sum + (row._sum.count ?? 0), 0),
    unidentifiedAuthors: await unidentifiedAuthors(unidentified, repositories) };
  if (filters.view === "general") {
    const [daily, activity, recent] = await Promise.all([
      db.githubDailyContribution.groupBy({ by: ["day", "type"], where: { ...common, user: userFilter }, orderBy: { day: "asc" }, _sum: { count: true } }),
      db.githubDailyContribution.groupBy({ by: ["userId"], where: { ...common, user: userFilter }, _sum: { count: true }, orderBy: [{ _sum: { count: "desc" } }, { userId: "asc" }] }),
      db.githubContribution.findMany({ where: { tenantId, repositoryId: { in: repoIds }, day: common.day, current: true, user: userFilter, ...(filters.type ? { type: filters.type } : {}) },
        orderBy: [{ occurredAt: "desc" }, { id: "asc" }], take: 8, select: eventSelect }),
    ]);
    const counts = emptyCounts(), byDay = new Map<string, ReturnType<typeof emptyCounts>>();
    for (const row of daily) {
      const type = row.type as ContributionType, count = row._sum.count ?? 0, day = byDay.get(row.day) ?? emptyCounts();
      counts[type] += count; day[type] += count; byDay.set(row.day, day);
    }
    const leaders = activity.slice(0, 4);
    const people = await db.githubUser.findMany({ where: { ...userFilter, id: { in: leaders.map(row => row.userId) } }, select: { id: true, login: true, externalId: true } });
    const byId = new Map(people.map(person => [person.id, person]));
    return { ...totals,
      summary: { counts, activeDevelopers: activity.length, days: [...byDay].map(([day, counts]) => ({ day, counts })),
        leaders: leaders.flatMap(row => { const person = byId.get(row.userId); return person ? [{ id: row.userId, login: person.login, name: names.get(person.externalId) ?? null, total: row._sum.count ?? 0 }] : []; }),
        recent: recent.map(row => toEvent(row, names)) } };
  }
  if (filters.view === "repositories") return { ...totals, ...await repositoryHeatmaps(tenantId, common, userFilter, filters.page, pageSize, names) };
  const page = Math.min(filters.page, Math.max(1, Math.ceil(totalUsers / pageSize)));
  const users = await db.githubUser.findMany({ where: whereUser, orderBy: [{ login: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
    select: { id: true, login: true, externalId: true, isBot: true, tracked: true } });
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
  const result: HeatmapUser[] = users.map(({ externalId, ...user }) => {
    const { counts, days } = byUser.get(user.id)!;
    return { ...user, name: names.get(externalId) ?? null, counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0), activeDays: days.length, days };
  });
  return { ...totals, users: result, page };
}

async function unidentifiedAuthors(rows: { userId: string; repositoryId: string; _sum: { count: number | null } }[], repositories: { id: string }[]): Promise<UnidentifiedAuthor[]> {
  if (!rows.length) return [];
  const db = getPrisma();
  const [users, repos] = await Promise.all([
    db.githubUser.findMany({ where: { id: { in: [...new Set(rows.map(row => row.userId))] } }, select: { id: true, login: true } }),
    db.githubRepository.findMany({ where: { id: { in: repositories.map(repo => repo.id) } }, select: { id: true, fullName: true } }),
  ]);
  const logins = new Map(users.map(user => [user.id, user.login])), names = new Map(repos.map(repo => [repo.id, repo.fullName]));
  return rows.map(row => ({ id: `${row.userId}:${row.repositoryId}`, login: logins.get(row.userId) ?? "Autoria não identificada", repository: names.get(row.repositoryId) ?? "—", total: row._sum.count ?? 0 }))
    .sort((a, b) => b.total - a.total || a.login.localeCompare(b.login, "pt-BR") || a.repository.localeCompare(b.repository));
}

// Aba Repositórios (27/10/2026): todos os repositórios selecionados, do mais ativo ao
// menos, cada um com o calendário e a parte de cada desenvolvedor no período.
async function repositoryHeatmaps(tenantId: string, common: Prisma.GithubDailyContributionWhereInput & { repositoryId: { in: string[] } },
  userFilter: Prisma.GithubUserWhereInput, requestedPage: number, pageSize: number, names: Map<string, string>) {
  const db = getPrisma();
  const [repos, totals] = await Promise.all([
    db.githubRepository.findMany({ where: { tenantId, id: { in: common.repositoryId.in } }, select: { id: true, fullName: true, private: true } }),
    db.githubDailyContribution.groupBy({ by: ["repositoryId"], where: { ...common, user: userFilter }, _sum: { count: true } }),
  ]);
  const sums = new Map(totals.map(row => [row.repositoryId, row._sum.count ?? 0]));
  repos.sort((a, b) => (sums.get(b.id) ?? 0) - (sums.get(a.id) ?? 0) || a.fullName.localeCompare(b.fullName, "pt-BR"));
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(repos.length / pageSize))), visible = repos.slice((page - 1) * pageSize, page * pageSize);
  const where = { ...common, repositoryId: { in: visible.map(repo => repo.id) }, user: userFilter };
  const [days, people] = await Promise.all([
    db.githubDailyContribution.groupBy({ by: ["repositoryId", "day"], where, orderBy: [{ repositoryId: "asc" }, { day: "asc" }], _sum: { count: true } }),
    db.githubDailyContribution.groupBy({ by: ["repositoryId", "userId", "type"], where, _sum: { count: true } }),
  ]);
  const users = await db.githubUser.findMany({ where: { id: { in: [...new Set(people.map(row => row.userId))] } }, select: { id: true, login: true, externalId: true } });
  const byId = new Map(users.map(user => [user.id, user]));
  const entries = new Map(visible.map(repo => [repo.id, { counts: emptyCounts(), days: [] as { day: string; count: number }[], contributors: new Map<string, RepositoryHeatmap["contributors"][number]>() }]));
  for (const row of days) entries.get(row.repositoryId)?.days.push({ day: row.day, count: row._sum.count ?? 0 });
  for (const row of people) {
    const entry = entries.get(row.repositoryId), user = byId.get(row.userId), count = row._sum.count ?? 0, type = row.type as ContributionType;
    if (!entry || !user) continue;
    entry.counts[type] += count;
    const person = entry.contributors.get(user.id) ?? { id: user.id, login: user.login, name: names.get(user.externalId) ?? null, total: 0, counts: emptyCounts() };
    person.counts[type] += count; person.total += count; entry.contributors.set(user.id, person);
  }
  const repositories: RepositoryHeatmap[] = visible.map(repo => {
    const { counts, days, contributors } = entries.get(repo.id)!;
    return { ...repo, counts, days, total: sums.get(repo.id) ?? 0, activeDays: days.length,
      contributors: [...contributors.values()].sort((a, b) => b.total - a.total || a.login.localeCompare(b.login)) };
  });
  return { repositories, totalRepositories: repos.length, page };
}
// Sem `userId`, o dia de um repositório (aba Repositórios): todas as pessoas do filtro.
export async function dayEvents(tenantId: string, filters: Filters, userId: string | null, day: string, page: number) {
  const [access, names] = await Promise.all([readable(tenantId), linkedPeople(tenantId)]);
  const ids = access.repositories.filter(repo => (!filters.repository || repo.id === filters.repository) && (!filters.organization || repo.owner.toLowerCase() === filters.organization.toLowerCase())).map(repo => repo.id);
  if (!access.connection || access.connection.status !== "connected" || !ids.length) throw new GithubError("Confirme o acesso aos repositórios antes de consultar os eventos.", 403);
  if (!userId && !filters.repository) throw new GithubError("Informe o desenvolvedor ou o repositório.");
  const where = { tenantId, ...(userId ? { userId } : {}), day, current: true, repositoryId: { in: ids }, ...(filters.type ? { type: filters.type } : {}),
    user: { connectionId: access.connection.id, unidentified: false, ...(filters.bots === "0" ? { isBot: false } : {}),
      ...(userId || filters.all === "1" ? {} : { externalId: { in: [...names.keys()] } }) } } satisfies Prisma.GithubContributionWhereInput;
  const [total, rows] = await Promise.all([getPrisma().githubContribution.count({ where }), getPrisma().githubContribution.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "asc" }], skip: (page - 1) * 50, take: 50,
    select: eventSelect })]);
  return { events: rows.map(row => toEvent(row, names)), total, page, pageSize: 50 };
}
