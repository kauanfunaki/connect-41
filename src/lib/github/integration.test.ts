import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type { AuthContext } from "@/lib/auth/context";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const url = process.env.GITHUB_TEST_DATABASE_URL, target = url ? new URL(url) : null;
if (target && (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "33381" || target.pathname !== "/connect41")) throw new Error("Banco não isolado recusado.");
const sqlQueries: string[] = [];
const db = target ? new PrismaClient({ adapter: new PrismaMariaDb({ host: target.hostname, port: 33381, user: decodeURIComponent(target.username), password: decodeURIComponent(target.password), database: "connect41", allowPublicKeyRetrieval: true }), log: [{ emit: "event", level: "query" }] }) : null;
db?.$on("query", event => sqlQueries.push(event.query));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => { if (!db) throw new Error("Banco descartável não configurado."); return db; } }));
vi.mock("@/lib/auth/context", async original => ({ ...await original<typeof import("@/lib/auth/context")>(), getAuthContext: mocks.auth }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
import { githubAccess } from "./access";
import { beginOAuth, finishOAuth } from "./oauth";
import { connectionQuery, ensureConnection, getConnection, guardGeneration, queueRepositories } from "./store";
import { processConnection, processGithubCron, scheduleSync, withGithubLease } from "./sync";
import { filtersSchema, historyStart, dayAt } from "./rules";
import { dashboard, dayEvents } from "./queries";
import { changeIntegration, integrationView } from "./service";
import { getDashboard, githubResponse, postIntegration, validCronToken } from "./http";
import { setModuleSector, setorDoModulo } from "@/lib/modules";
import { GITHUB_MODULE, type DashboardView } from "./types";

describe.skipIf(!url)("GitHub com MySQL descartável e API simulada", { timeout: 30000 }, () => {
  let tenantId: string, ctx: AuthContext, connectionId: string, repositoryId: string, githubId: string;
  let sha: string, revoked: boolean, malformed: boolean, limited: boolean, rewritten: boolean, secondIdentity: boolean;
  let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
  const credentials = () => ({ clientId: `fixture-${tenantId}`, clientSecret: `${tenantId}-fake-secret` });
  const stamp = () => new Date(Date.now() - 86400000).toISOString();
  const user = (login: string) => ({ node_id: `U_fixture_${login}`, login, type: "User" });
  const repo = () => ({ node_id: `R_${tenantId}`, name: "exemplo", full_name: "acme/exemplo", owner: { login: "acme" }, default_branch: "main", private: true, fork: false, archived: false });
  const commit = () => ({ sha, author: user("ana"), html_url: `https://github.com/acme/exemplo/commit/${sha}`, commit: { committer: { date: stamp() } } });
  const issue = () => ({ node_id: "I_fixture_1", user: user("bruno"), html_url: "https://github.com/acme/exemplo/issues/1", number: 1, created_at: stamp(), updated_at: stamp() });
  const pull = (old = false) => ({ node_id: `PR_fixture_${old ? 3 : 2}`, user: user(old ? "autor-antigo" : "carla"), html_url: `https://github.com/acme/exemplo/pull/${old ? 3 : 2}`,
    number: old ? 3 : 2, created_at: old ? "2022-01-01T12:00:00Z" : stamp(), updated_at: stamp() });
  beforeAll(() => {
    vi.stubEnv("SECRETS_ENCRYPTION_KEY", "github-tests-only-encryption");
    vi.stubEnv("GITHUB_CLIENT_ID", ""); vi.stubEnv("GITHUB_CLIENT_SECRET", ""); vi.stubEnv("APP_PUBLIC_URL", "http://localhost:3111");
  });
  beforeEach(async () => {
    tenantId = randomUUID(); githubId = `U_account_${tenantId}`; sha = "a".repeat(40); revoked = false; malformed = false; limited = false; rewritten = false; secondIdentity = false;
    await db!.tenant.create({ data: { id: tenantId, name: "Escritório fictício GitHub", slug: `github-${tenantId}` } });
    await db!.tenantModule.create({ data: { tenantId, moduleCode: GITHUB_MODULE, enabled: true } });
    const userId = randomUUID();
    await db!.user.create({ data: { id: userId, tenantId, name: "Administrador fictício", email: `${userId}@example.test`, passwordHash: "sem-login-real", role: "ADMIN" } });
    ctx = { tenantId, userId, homeTenantId: tenantId, role: "ADMIN", sectors: ["tech"], subscriptionReadOnly: false, canSelfRegularizeSubscription: false, activeSector: "tech" };
    mocks.auth.mockResolvedValue(ctx);
    const connection = await ensureConnection(tenantId); connectionId = connection.id;
    await db!.githubConnection.update({ where: { id: connectionId }, data: { githubUserId: githubId, login: "conta-ficticia", status: "connected", verifiedAt: new Date() } });
    await db!.tenantIntegration.update({ where: { id: connection.integrationId }, data: { enabled: true, configEnc: encryptSecret(JSON.stringify({ ...credentials(), accessToken: "github-fake-access-only-for-tests", scope: "repo read:user" })) } });
    const repository = await db!.githubRepository.create({ data: { tenantId, connectionId, externalId: repo().node_id, owner: "acme", name: "exemplo", fullName: "acme/exemplo", defaultBranch: "main", private: true, selected: true, accessCheckedAt: new Date() } });
    repositoryId = repository.id;
    fetcher = vi.fn<typeof fetch>(async input => {
      const address = new URL(String(input));
      if (address.origin === "https://github.com" && address.pathname === "/login/oauth/access_token") return Response.json({ access_token: "new-fake-github-token", scope: "repo,read:user", token_type: "bearer" });
      if (address.origin !== "https://api.github.com") throw new Error("Origem externa inesperada no teste");
      if (limited) return Response.json({ message: "secondary rate limit" }, { status: 429, headers: { "retry-after": "60" } });
      if (revoked) return Response.json({ message: "Bad credentials" }, { status: 401 });
      const path = address.pathname;
      if (path === "/user") return Response.json({ node_id: secondIdentity ? `U_other_${tenantId}` : githubId, login: secondIdentity ? "outra-conta" : "conta-ficticia", type: "User" });
      if (path === "/user/repos") return Response.json([repo()]);
      if (path.startsWith("/users/")) return Response.json(user(path.split("/").at(-1)!));
      if (path === "/repos/acme/exemplo") return Response.json(repo());
      if (path.includes("/compare/")) return Response.json({ status: rewritten ? "diverged" : "identical", commits: [] });
      if (path.endsWith("/commits")) return malformed && address.searchParams.get("per_page") !== "1" ? new Response("[{broken") : Response.json([commit()]);
      if (path.endsWith("/issues")) return Response.json([issue(), { ...pull(), pull_request: {} }]);
      if (path.endsWith("/pulls")) return Response.json([pull(), pull(true)]);
      if (path.endsWith("/pulls/2/reviews")) return Response.json([]);
      if (path.endsWith("/pulls/3/reviews")) return Response.json([{ node_id: "PRR_fixture_1", user: user("daniela"), submitted_at: stamp(), state: "APPROVED", html_url: "https://github.com/acme/exemplo/pull/3#pullrequestreview-1" }]);
      throw new Error(`Recurso simulado ausente: ${path}`);
    });
    vi.stubGlobal("fetch", fetcher);
  });
  afterEach(async () => {
    await db!.githubOAuthAttempt.deleteMany({ where: { tenantId } });
    await db!.tenantIntegration.deleteMany({ where: { tenantId } });
    await db!.tenantModule.deleteMany({ where: { tenantId } });
    await db!.user.deleteMany({ where: { tenantId } });
    await db!.tenant.delete({ where: { id: tenantId } });
    await db!.githubAccountLease.deleteMany({ where: { githubUserId: { in: [githubId, `U_other_${tenantId}`] } } });
    vi.unstubAllGlobals();
  });
  afterAll(async () => { vi.unstubAllEnvs(); await db?.$disconnect(); });
  const collect = async () => {
    const connection = (await getConnection(tenantId))!;
    await queueRepositories(db!, connection, [{ id: repositoryId }]);
    return processConnection(tenantId, { steps: 100, milliseconds: 25000 });
  };
  it("coleta os quatro tipos, incluindo revisão recente em PR antigo e usuário sem commits", async () => {
    await collect();
    const view = await dashboard(tenantId, filtersSchema.parse({}));
    expect(view.total).toBe(4); expect(view.complete).toBe(true);
    expect(view.users.map(person => person.login)).toEqual(["ana", "bruno", "carla", "daniela"]);
    expect(view.users.find(person => person.login === "daniela")?.counts).toMatchObject({ COMMIT: 0, REVIEW: 1 });
    expect(await db!.githubContribution.count({ where: { tenantId, type: "ISSUE" } })).toBe(1);
  });
  it("repetir a coleta ou a janela sobreposta não duplica eventos ou agregados", async () => {
    await collect(); await collect();
    expect(await db!.githubContribution.count({ where: { tenantId, current: true } })).toBe(4);
    expect((await db!.githubDailyContribution.aggregate({ where: { tenantId }, _sum: { count: true } }))._sum.count).toBe(4);
  });
  it("revalida o acesso e dispensa calendários, totais e cobertura no polling sem mudanças", async () => {
    await collect();
    const filters = filtersSchema.parse({}), first = await dashboard(tenantId, filters);
    sqlQueries.length = 0;
    const next = await dashboard(tenantId, filters, first.revision);
    expect(next).toMatchObject({ unchanged: true, revision: first.revision, pending: 0, failed: 0 });
    expect(sqlQueries.some(sql => /github_daily_contributions|github_users/.test(sql))).toBe(false);
    expect(sqlQueries.some(sql => /github_repositories/.test(sql))).toBe(true);
    expect(sqlQueries.filter(sql => /GROUP BY/.test(sql))).toHaveLength(1);
    // A lease pode mudar sem alterar contribuições: o progresso continua atual.
    await db!.githubAccountLease.update({ where: { githubUserId: githubId }, data: { owner: "fixture-active-worker", expiresAt: new Date(Date.now() + 60000) } });
    expect(await dashboard(tenantId, filters, first.revision)).toMatchObject({ unchanged: true, progress: { state: "processing" } });
  });
  it("descarta a revisão quando mudam filtros, acompanhamento ou um lote confirmado", async () => {
    await collect();
    const filters = filtersSchema.parse({}), first = await dashboard(tenantId, filters);
    const filtered = await dashboard(tenantId, filtersSchema.parse({ type: "REVIEW" }), first.revision);
    expect(filtered).toMatchObject({ total: 1 }); expect(filtered.revision).not.toBe(first.revision);
    const connection = (await getConnection(tenantId))!;
    await db!.$transaction(async tx => {
      await guardGeneration(tx, connection);
      await tx.githubUser.create({ data: { tenantId, connectionId, externalId: "U_tracked", login: "sem-atividade", tracked: true } });
    });
    const tracked = await dashboard(tenantId, filters, first.revision);
    expect("users" in tracked && tracked.users.some(user => user.login === "sem-atividade")).toBe(true);
    expect(tracked.revision).not.toBe(first.revision);
    sha = "b".repeat(40);
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => new URL(String(input)).pathname.includes("/compare/")
      ? Response.json({ status: "ahead", commits: [commit()] }) : original(input, init));
    await collect();
    const collected = await dashboard(tenantId, filters, tracked.revision);
    expect(collected).toMatchObject({ total: 5 }); expect(collected.revision).not.toBe(tracked.revision);
  });
  it("a revisão não prolonga acesso expirado nem ignora a remoção de um repositório", async () => {
    await collect();
    const filters = filtersSchema.parse({}), first = await dashboard(tenantId, filters);
    await db!.githubRepository.update({ where: { id: repositoryId }, data: { accessCheckedAt: new Date(Date.now() - 301000) } });
    const expired = await dashboard(tenantId, filters, first.revision);
    expect(expired).toMatchObject({ total: 0, unavailable: 1, repositories: [] });
    await db!.githubRepository.update({ where: { id: repositoryId }, data: { selected: false } });
    expect(await dashboard(tenantId, filters, expired.revision)).toMatchObject({ total: 0, unavailable: 0, repositories: [] });
  });
  it("confere a autorização em cada polling mesmo com revisão válida", async () => {
    await collect();
    const first = await dashboard(tenantId, filtersSchema.parse({}));
    mocks.auth.mockResolvedValue({ ...ctx, role: "SECTOR_USER", sectors: ["fiscal"] });
    const response = await githubResponse(() => getDashboard(new Request(`http://localhost/api/github?revision=${first.revision}`)));
    expect(response.status).toBe(403);
  });
  it("mantém o polling leve com vinte pessoas e um ano cheio de agregados", async () => {
    const users = Array.from({ length: 20 }, (_, index) => ({ id: randomUUID(), tenantId, connectionId, externalId: `U_volume_${index}`, login: `volume-${index}`, tracked: true }));
    await db!.githubUser.createMany({ data: users });
    const records = users.flatMap(user => Array.from({ length: 366 }, (_, offset) => dayAt(new Date(Date.now() - offset * 86400000))).flatMap(day =>
      ["COMMIT", "PULL_REQUEST", "ISSUE", "REVIEW"].map(type => ({ tenantId, repositoryId, userId: user.id, day, type, count: 1 }))));
    for (let offset = 0; offset < records.length; offset += 500) await db!.githubDailyContribution.createMany({ data: records.slice(offset, offset + 500) });
    const filters = filtersSchema.parse({}), fullMs: number[] = [], unchangedMs: number[] = [];
    let full!: DashboardView, fullQueries = 0, unchangedQueries = 0, compactBytes = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      sqlQueries.length = 0; const start = performance.now(); full = await dashboard(tenantId, filters);
      fullMs.push(performance.now() - start); fullQueries = sqlQueries.length;
    }
    expect(full.total).toBe(29280); expect(full.users).toHaveLength(20);
    for (let attempt = 0; attempt < 5; attempt++) {
      sqlQueries.length = 0; const start = performance.now(), next = await dashboard(tenantId, filters, full.revision);
      unchangedMs.push(performance.now() - start); unchangedQueries = sqlQueries.length;
      expect(next).toMatchObject({ unchanged: true, revision: full.revision });
      expect(sqlQueries.some(sql => /github_daily_contributions|github_users/.test(sql))).toBe(false);
      compactBytes = Buffer.byteLength(JSON.stringify(next));
    }
    expect(unchangedQueries).toBeLessThan(fullQueries);
    await mkdir(".local/github", { recursive: true });
    await writeFile(".local/github/query-performance.json", JSON.stringify({ users: 20, aggregateRows: records.length,
      full: { queries: fullQueries, bytes: Buffer.byteLength(JSON.stringify(full)), milliseconds: fullMs.map(ms => Math.round(ms)) },
      unchanged: { queries: unchangedQueries, bytes: compactBytes, milliseconds: unchangedMs.map(ms => Math.round(ms)) } }, null, 2));
  }, 60000);
  it("pagina o inventário e não seleciona novos repositórios automaticamente", async () => {
    const original = fetcher.getMockImplementation()!;
    const extras = Array.from({ length: 100 }, (_, index) => ({ ...repo(), node_id: `R_extra_${index}_${tenantId}`, name: `r${index}`, full_name: `acme/r${index}` }));
    fetcher.mockImplementation(async (input, init) => {
      const address = new URL(String(input));
      if (address.pathname === "/user/repos") return Response.json(address.searchParams.get("page") === "1" ? [repo(), ...extras.slice(0, 99)] : extras.slice(99));
      return original(input, init);
    });
    await scheduleSync((await getConnection(tenantId))!, true); await processConnection(tenantId, { steps: 100, milliseconds: 25000 });
    expect(await db!.githubRepository.count({ where: { tenantId } })).toBe(101);
    expect(await db!.githubRepository.count({ where: { tenantId, selected: true } })).toBe(1);
    expect((await getConnection(tenantId))?.inventoryAt).not.toBeNull();
  });
  it("retoma uma segunda página com falha sem pular ou duplicar os cem itens confirmados", async () => {
    const original = fetcher.getMockImplementation()!, rows = [commit(), ...Array.from({ length: 100 }, (_, index) => ({ ...commit(), sha: (index + 1).toString(16).padStart(40, "0") }))];
    let broken = true;
    fetcher.mockImplementation(async (input, init) => {
      const address = new URL(String(input));
      if (address.pathname.endsWith("/commits") && address.searchParams.get("per_page") === "100") {
        if (address.searchParams.get("page") === "2") return broken ? new Response("{broken") : Response.json(rows.slice(100));
        return Response.json(rows.slice(0, 100));
      }
      return original(input, init);
    });
    await collect();
    const job = await db!.githubSyncJob.findFirstOrThrow({ where: { connectionId, resource: "COMMIT" } });
    expect(job.cursor).toMatchObject({ page: 2 }); expect(job.coveredThrough).toBeNull();
    expect(await db!.githubContribution.count({ where: { tenantId, type: "COMMIT" } })).toBe(100);
    broken = false; await db!.githubSyncJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    await processConnection(tenantId, { steps: 100, milliseconds: 25000 });
    const view = await dashboard(tenantId, filtersSchema.parse({})); expect(view.total).toBe(104); expect(view.complete).toBe(true);
  }, 30000);
  it("renova tokens expirados sob a mesma lease e guarda a rotação somente cifrada", async () => {
    const connection = (await getConnection(tenantId))!, original = fetcher.getMockImplementation()!;
    await db!.tenantIntegration.update({ where: { id: connection.integrationId }, data: { configEnc: encryptSecret(JSON.stringify({ ...credentials(), accessToken: "old-fake", refreshToken: "old-refresh-fake", expiresAt: new Date(0).toISOString(), scope: "repo read:user" })) } });
    fetcher.mockImplementation(async (input, init) => String(input).includes("/login/oauth/access_token")
      ? Response.json({ access_token: "renewed-fake", refresh_token: "rotated-fake", expires_in: 3600, scope: "repo,read:user" }) : original(input, init));
    await collect(); await dashboard(tenantId, filtersSchema.parse({}));
    const stored = (await getConnection(tenantId))!.integration.configEnc;
    expect(stored).not.toContain("renewed-fake");
    expect(JSON.parse(decryptSecret(stored))).toMatchObject({ ...credentials(), accessToken: "renewed-fake", refreshToken: "rotated-fake" });
    const sent = fetcher.mock.calls.find(([input]) => String(input).includes("access_token"))?.[1]?.body;
    expect(new URLSearchParams(String(sent)).get("client_secret")).toBe(credentials().clientSecret);
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes("/login/oauth/access_token"))).toHaveLength(1);
  });
  it("retoma a cobertura das revisões já coletadas mesmo sem PRs alterados", async () => {
    await collect(); await changeIntegration(ctx, { action: "pause", generation: 0 });
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => new URL(String(input)).pathname.endsWith("/pulls") ? Response.json([]) : original(input, init));
    await changeIntegration(ctx, { action: "resume", generation: 1 });
    await processConnection(tenantId, { steps: 100, milliseconds: 25000 });
    const view = await dashboard(tenantId, filtersSchema.parse({})); expect(view.total).toBe(4); expect(view.complete).toBe(true);
  });
  it("retoma após resposta truncada sem confirmar cobertura ou pular a página", async () => {
    malformed = true; await collect();
    const job = await db!.githubSyncJob.findFirstOrThrow({ where: { connectionId, resource: "COMMIT" } });
    expect(job.coveredThrough).toBeNull(); expect(job.attempts).toBe(1);
    expect((await dashboard(tenantId, filtersSchema.parse({}))).complete).toBe(false);
    malformed = false; await db!.githubSyncJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    await processConnection(tenantId, { steps: 100, milliseconds: 25000 });
    const recovered = await dashboard(tenantId, filtersSchema.parse({}));
    expect(recovered.total).toBe(4); expect(recovered.message).toBeNull();
  });
  it("persiste Retry-After e coordena a espera entre executores", async () => {
    limited = true; await collect();
    const job = await db!.githubSyncJob.findFirstOrThrow({ where: { connectionId, resource: "COMMIT" } });
    expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 55000);
    expect(job.coveredThrough).toBeNull();
    const calls = fetcher.mock.calls.length;
    await expect(processConnection(tenantId)).rejects.toMatchObject({ status: 409 });
    expect(fetcher.mock.calls.length).toBe(calls);
  });
  it("uma lease ativa impede concorrência, sem depender de PID ou memória do processo", async () => {
    let release!: () => void, started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const work = withGithubLease(githubId, async () => { started(); await new Promise<void>(resolve => { release = resolve; }); });
    await entered;
    try { await expect(withGithubLease(githubId, async () => {})).rejects.toMatchObject({ status: 409 }); }
    finally { release(); await work; }
  });
  it("descarta a gravação de uma resposta iniciada antes de uma troca de geração", async () => {
    let confirmedBeforeChange = 0;
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => {
      const address = new URL(String(input));
      if (address.pathname.endsWith("/commits") && address.searchParams.get("per_page") !== "1") {
        confirmedBeforeChange = await db!.githubContribution.count({ where: { tenantId } });
        await db!.githubConnection.update({ where: { id: connectionId }, data: { generation: { increment: 1 } } });
      }
      return original(input, init);
    });
    await collect();
    expect(await db!.githubContribution.count({ where: { tenantId } })).toBe(confirmedBeforeChange);
    expect(await db!.githubContribution.count({ where: { tenantId, type: "COMMIT" } })).toBe(0);
  });
  it("reconcilia histórico reescrito e retira commits que saíram do branch padrão", async () => {
    await collect(); sha = "b".repeat(40); rewritten = true; await collect();
    expect(await db!.githubContribution.count({ where: { tenantId, type: "COMMIT", current: true } })).toBe(1);
    expect(await db!.githubContribution.findFirst({ where: { tenantId, externalId: "a".repeat(40) } })).toMatchObject({ current: false });
    expect((await dashboard(tenantId, filtersSchema.parse({}))).total).toBe(4);
  });
  it("exclui dados após revogação e preserva os registros para recuperação", async () => {
    await collect(); revoked = true;
    await db!.githubConnection.update({ where: { id: connectionId }, data: { verifiedAt: new Date(0) } });
    // Sem acesso recente, a leitura já deve ocultar os dados sem chamar a API.
    const calls = fetcher.mock.calls.length;
    expect((await dashboard(tenantId, filtersSchema.parse({}))).total).toBe(0);
    expect(fetcher.mock.calls).toHaveLength(calls);
    await processGithubCron();
    const view = await dashboard(tenantId, filtersSchema.parse({}));
    expect(view.connected).toBe(false); expect(view.users).toEqual([]); expect(view.total).toBe(0);
    expect(await db!.githubContribution.count({ where: { tenantId } })).toBe(4);
  });
  it("coleta e retoma lotes automaticamente sem nenhuma página aberta", async () => {
    for (let round = 0; round < 12; round++) await processGithubCron();
    const view = await dashboard(tenantId, filtersSchema.parse({}));
    expect(view.total).toBe(4); expect(view.pending).toBe(0); expect(view.complete).toBe(true);
    expect(view.progress).toMatchObject({ state: "idle", pending: 0, failed: 0 });
    expect(await db!.integrationRun.count({ where: { integrationId: (await getConnection(tenantId))!.integrationId, trigger: "CRON", ok: true } })).toBeGreaterThan(0);
    // A leitura repetida não disputa a lease nem gera novas requisições GitHub.
    const calls = fetcher.mock.calls.length;
    await withGithubLease(githubId, async () => {
      expect((await dashboard(tenantId, filtersSchema.parse({}))).total).toBe(4);
    });
    expect(fetcher.mock.calls).toHaveLength(calls);
    await processGithubCron(); expect((await dashboard(tenantId, filtersSchema.parse({}))).total).toBe(4);
  });
  it("isola detalhes por escritório, repositório selecionado e tipo", async () => {
    await collect();
    const ana = await db!.githubUser.findFirstOrThrow({ where: { tenantId, login: "ana" } });
    const view = await dayEvents(tenantId, filtersSchema.parse({}), ana.id, dayAt(new Date(stamp())), 1);
    expect(view.total).toBe(1);
    const filtered = await dashboard(tenantId, filtersSchema.parse({ type: "REVIEW" }));
    expect(filtered.users.map(person => person.login)).toEqual(["daniela"]);
    await expect(changeIntegration(ctx, { action: "settings", generation: 0, repositories: [randomUUID()], timezone: "America/Sao_Paulo", intervalMinutes: 30 })).rejects.toMatchObject({ status: 403 });
    await db!.githubRepository.update({ where: { id: repositoryId }, data: { selected: false } });
    expect((await dashboard(tenantId, filtersSchema.parse({}))).total).toBe(0);
  });
  it("inclui usuário acompanhado sem inventar contribuições e protege a projeção dos tokens", async () => {
    await collect(); await changeIntegration(ctx, { action: "track", generation: 0, login: "sem-atividade" });
    const view = await dashboard(tenantId, filtersSchema.parse({}));
    expect(view.users.find(person => person.login === "sem-atividade")).toMatchObject({ total: 0, tracked: true });
    expect(JSON.stringify(await integrationView(tenantId))).not.toMatch(/fake-access|configEnc|refreshToken|accessToken/);
  });
  it("pausa e desconecta com geração nova sem apagar histórico", async () => {
    await collect(); await changeIntegration(ctx, { action: "pause", generation: 0 });
    expect((await getConnection(tenantId))?.integration.enabled).toBe(false);
    await changeIntegration(ctx, { action: "disconnect", generation: 1 });
    expect((await dashboard(tenantId, filtersSchema.parse({}))).connected).toBe(false);
    expect(await db!.githubContribution.count({ where: { tenantId } })).toBe(4);
    expect(JSON.parse(decryptSecret((await getConnection(tenantId))!.integration.configEnc))).toEqual(credentials());
  });
  it("bloqueia Fiscal e assinatura em somente leitura e impede transferência do módulo", async () => {
    mocks.auth.mockResolvedValue({ ...ctx, role: "SECTOR_USER", sectors: ["fiscal"] });
    await expect(githubAccess()).rejects.toMatchObject({ status: 403 });
    mocks.auth.mockResolvedValue({ ...ctx, role: "SECTOR_USER", sectors: ["tech"] });
    await expect(githubAccess()).resolves.toMatchObject({ tenantId });
    mocks.auth.mockResolvedValue({ ...ctx, subscriptionReadOnly: true });
    await expect(githubAccess("gerir")).rejects.toMatchObject({ status: 403 });
    await expect(setModuleSector(tenantId, GITHUB_MODULE, "fiscal")).rejects.toThrow("exclusivo");
    await db!.tenantModule.update({ where: { tenantId_moduleCode: { tenantId, moduleCode: GITHUB_MODULE } }, data: { sectorCode: "fiscal" } });
    expect(await setorDoModulo(tenantId, GITHUB_MODULE)).toBe("tech");
  });
  it("OAuth vincula estado a sessão e escritório e o consome uma única vez", async () => {
    const attempt = await beginOAuth(ctx, "sessao-ficticia");
    const parsed = new URL(attempt.url); expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    await expect(finishOAuth({ ...ctx, tenantId: randomUUID() }, "sessao-ficticia", attempt.state, "codigo-ficticio")).rejects.toMatchObject({ status: 403 });
    await expect(finishOAuth(ctx, "outra-sessao", attempt.state, "codigo-ficticio")).rejects.toMatchObject({ status: 403 });
    await finishOAuth(ctx, "sessao-ficticia", attempt.state, "codigo-ficticio");
    await expect(finishOAuth(ctx, "sessao-ficticia", attempt.state, "codigo-ficticio")).rejects.toMatchObject({ status: 403 });
    expect((await getConnection(tenantId))?.generation).toBe(1);
    const sent = fetcher.mock.calls.find(([input]) => String(input).includes("access_token"))?.[1]?.body;
    expect(new URLSearchParams(String(sent)).get("code_verifier")?.length).toBeGreaterThan(43);
    expect(parsed.searchParams.get("client_id")).toBe(credentials().clientId);
    expect(new URLSearchParams(String(sent)).get("client_secret")).toBe(credentials().clientSecret);
    expect(JSON.parse(decryptSecret((await getConnection(tenantId))!.integration.configEnc))).toMatchObject(credentials());
  });
  it("trocar de conta arquiva a conexão anterior e não mistura nem apaga seus dados", async () => {
    await collect(); const attempt = await beginOAuth(ctx, "sessao-ficticia"); secondIdentity = true;
    await finishOAuth(ctx, "sessao-ficticia", attempt.state, "codigo-ficticio");
    const current = await db!.githubConnection.findFirstOrThrow({ where: connectionQuery(tenantId) });
    expect(current.id).not.toBe(connectionId);
    expect(await db!.githubConnection.findUnique({ where: { id: connectionId } })).toMatchObject({ status: "archived" });
    expect(await db!.githubContribution.count({ where: { tenantId } })).toBe(4);
    expect(await db!.githubRepository.count({ where: { connectionId: current.id } })).toBe(0);
    expect(JSON.parse(decryptSecret((await getConnection(tenantId))!.integration.configEnc))).toMatchObject(credentials());
  });
  it("cadastra as primeiras credenciais pela API sem variáveis GitHub e não devolve o segredo", async () => {
    await db!.tenantIntegration.delete({ where: { id: (await getConnection(tenantId))!.integrationId } });
    expect(await integrationView(tenantId)).toMatchObject({ configured: false, serverReady: true, clientId: "", hasClientSecret: false, generation: 0 });
    await postIntegration(new Request("http://localhost/api/github/integration", { method: "POST", headers: { origin: "http://localhost" },
      body: JSON.stringify({ action: "credentials", generation: 0, ...credentials() }) }));
    const connection = (await getConnection(tenantId))!, view = await integrationView(tenantId);
    expect(connection.integration.configEnc).not.toContain(credentials().clientSecret);
    expect(JSON.parse(decryptSecret(connection.integration.configEnc))).toEqual(credentials());
    expect(view).toMatchObject({ configured: true, clientId: credentials().clientId, hasClientSecret: true, connected: false, generation: 1,
      callbackUrl: "http://localhost:3111/api/integrations/github/callback" });
    expect(JSON.stringify(view)).not.toContain(credentials().clientSecret);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(credentials().clientSecret);
    const attempt = await beginOAuth(ctx, "nova-sessao");
    expect(new URL(attempt.url).searchParams.get("client_id")).toBe(credentials().clientId);
  });
  it("trocar segredo invalida OAuth pendente, tokens e lotes, preservando histórico", async () => {
    await collect(); const attempt = await beginOAuth(ctx, "sessao-ficticia");
    await changeIntegration(ctx, { action: "credentials", generation: 0, clientId: credentials().clientId, clientSecret: "novo-segredo-ficticio" });
    const connection = (await getConnection(tenantId))!;
    expect(connection).toMatchObject({ generation: 1, status: "needs_reconnect", verifiedAt: null, integration: { enabled: false } });
    expect(JSON.parse(decryptSecret(connection.integration.configEnc))).toEqual({ clientId: credentials().clientId, clientSecret: "novo-segredo-ficticio" });
    await expect(finishOAuth(ctx, "sessao-ficticia", attempt.state, "codigo-ficticio")).rejects.toMatchObject({ status: 403 });
    expect(await db!.githubContribution.count({ where: { tenantId } })).toBe(4);
    expect((await dashboard(tenantId, filtersSchema.parse({}))).connected).toBe(false);
    const next = await beginOAuth(ctx, "sessao-ficticia");
    await finishOAuth(ctx, "sessao-ficticia", next.state, "novo-codigo-ficticio");
    expect((await getConnection(tenantId))?.id).toBe(connectionId);
    expect(await db!.githubContribution.count({ where: { tenantId } })).toBe(4);
  });
  it("segredo vazio mantém o mesmo app; novo Client ID exige segredo e geração atual", async () => {
    await changeIntegration(ctx, { action: "credentials", generation: 0, clientId: credentials().clientId, clientSecret: "" });
    expect((await getConnection(tenantId))?.generation).toBe(0);
    await expect(changeIntegration(ctx, { action: "credentials", generation: 0, clientId: "outro-app", clientSecret: "" })).rejects.toThrow("Client Secret");
    await expect(changeIntegration(ctx, { action: "credentials", generation: 9, ...credentials() })).rejects.toMatchObject({ status: 409 });
    expect((await getConnection(tenantId))?.status).toBe("connected");
  });
  it("duas alterações concorrentes não sobrescrevem credenciais com tela desatualizada", async () => {
    const results = await Promise.allSettled(["segredo-a", "segredo-b"].map(clientSecret => changeIntegration(ctx, { action: "credentials", generation: 0, clientId: credentials().clientId, clientSecret })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect((await getConnection(tenantId))?.generation).toBe(1);
  });
  it("credenciais de outro escritório não são reutilizadas e acesso de consulta não pode salvar", async () => {
    const otherTenant = randomUUID();
    expect(await integrationView(otherTenant)).toMatchObject({ configured: false, clientId: "", hasClientSecret: false });
    await expect(beginOAuth({ ...ctx, tenantId: otherTenant }, "sessao-ficticia")).rejects.toThrow("Client ID");
    mocks.auth.mockResolvedValue({ ...ctx, role: "SECTOR_USER", sectors: ["tech"] });
    expect((await githubResponse(() => postIntegration(new Request("http://localhost/api/github/integration", { method: "POST", body: JSON.stringify({ action: "credentials", generation: 0, ...credentials() }) })))).status).toBe(403);
    expect((await getConnection(tenantId))?.generation).toBe(0);
  });
  it("sem chave da instalação bloqueia gravação e conserva configuração anterior", async () => {
    const before = (await getConnection(tenantId))!.integration.configEnc;
    vi.stubEnv("SECRETS_ENCRYPTION_KEY", "");
    try {
      await expect(changeIntegration(ctx, { action: "credentials", generation: 0, ...credentials() })).rejects.toMatchObject({ status: 503 });
      expect((await getConnection(tenantId))!.integration.configEnc).toBe(before);
    } finally { vi.stubEnv("SECRETS_ENCRYPTION_KEY", "github-tests-only-encryption"); }
  });
  it("rotas recusam JSON inválido, origem externa e consultas sem módulo ativo", async () => {
    expect((await githubResponse(() => postIntegration(new Request("http://localhost/api/github/integration", { method: "POST", headers: { origin: "https://evil.test" }, body: "{}" })))).status).toBe(403);
    expect((await githubResponse(() => postIntegration(new Request("http://localhost/api/github/integration", { method: "POST", body: "{bad" })))).status).toBe(400);
    await db!.tenantModule.update({ where: { tenantId_moduleCode: { tenantId, moduleCode: GITHUB_MODULE } }, data: { enabled: false } });
    expect((await githubResponse(() => getDashboard(new Request("http://localhost/api/github")))).status).toBe(403);
    const calls = fetcher.mock.calls.length; await scheduleSync((await getConnection(tenantId))!, true); await processConnection(tenantId);
    expect(fetcher.mock.calls.length).toBe(calls);
    vi.stubEnv("CRON_SERVICE_TOKEN", "cron-ficticio");
    expect(validCronToken(new Request("http://localhost", { headers: { authorization: "Bearer incorreto" } }))).toBe(false);
    expect(validCronToken(new Request("http://localhost", { headers: { authorization: "Bearer cron-ficticio" } }))).toBe(true);
    expect(historyStart().getTime()).toBeLessThan(Date.now());
  });
});
