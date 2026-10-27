// Navegador real e standalone isolado; banco e GitHub inteiramente fictícios.
import { spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { access, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mariadb from "mariadb";
import { chromium } from "playwright";

// O conector SQL codifica Date no fuso do processo; o Prisma e o servidor
// de produção usam instantes UTC. A fixture precisa gravar o mesmo instante.
process.env.TZ = "UTC";

const target = new URL(process.env.GITHUB_TEST_DATABASE_URL ?? "http://invalid");
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "33381" || target.pathname !== "/connect41") throw new Error("Defina GITHUB_TEST_DATABASE_URL para o banco descartável em 127.0.0.1:33381/connect41.");
const output = path.resolve(".local/github"); await mkdir(output, { recursive: true });
const workspace = process.env.GITHUB_UI_BUILD_WORKSPACE ?? JSON.parse(await readFile(path.join(output, "build-workspace.json"), "utf8")).workspace;
if (path.dirname(path.resolve(workspace)) !== output || !path.basename(workspace).startsWith("build-")) throw new Error("Build de verificação inválido.");
const executable = path.join(workspace, ".next/standalone/server.js"); await access(executable);
const port = await new Promise((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const base = `http://127.0.0.1:${port}`, secret = "github-ui-fixture-session", encryption = "github-ui-fixture-encryption";
const db = await mariadb.createConnection({ host: target.hostname, port: 33381, user: decodeURIComponent(target.username), password: decodeURIComponent(target.password), database: "connect41", allowPublicKeyRetrieval: true, timezone: "+00:00" });
const tenantId = randomUUID(), adminId = randomUUID(), techId = randomUUID(), fiscalId = randomUUID(), connectionId = randomUUID(), integrationId = randomUUID(), accountId = `U_account_${tenantId}`;
const repositories = [0, 1].map(index => ({ id: randomUUID(), node_id: `R_ui_${index}`, owner: { login: index ? "beta" : "alpha" }, name: index ? "tools" : "app", full_name: index ? "beta/tools" : "alpha/app", default_branch: "main", private: index === 0, fork: false, archived: false }));
const now = new Date(), from = new Date(now.getTime() - 367 * 86400000), types = ["COMMIT", "PULL_REQUEST", "ISSUE", "REVIEW"];
const key = scryptSync(encryption, "connect41-tenant-secrets", 32), iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([cipher.update(JSON.stringify({ clientId: "ui-fake-client", clientSecret: "ui-fake-secret", accessToken: "ui-fake-github-token", scope: "repo read:user" }), "utf8"), cipher.final()]);
const configEnc = `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
const dayAt = date => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const result = { checks: [], browserErrors: [] }, ok = name => { result.checks.push(name); console.log("OK: " + name); };
let browser, page, server, log;
try {
await db.query("INSERT INTO tenants (id,name,slug,updatedAt) VALUES (?,?,?,NOW(3))", [tenantId, "Escritório fictício — GitHub", `github-ui-${tenantId}`]);
for (const [id, name, role, sector] of [[adminId, "Gestor fictício", "ADMIN", "tech"], [techId, "Pessoa do Tech", "SECTOR_USER", "tech"], [fiscalId, "Pessoa do Fiscal", "SECTOR_USER", "fiscal"]]) {
  await db.query("INSERT INTO users (id,tenantId,name,email,passwordHash,role,updatedAt) VALUES (?,?,?,?,?,?,NOW(3))", [id, tenantId, name, `${id}@example.test`, "sem-login-real", role]);
  await db.query("INSERT INTO user_sectors (userId,sectorCode) VALUES (?,?)", [id, sector]);
}
for (const code of ["tech", "fiscal"]) await db.query("INSERT INTO sectors (id,tenantId,code,label,color,updatedAt) VALUES (?,?,?,?,?,NOW(3))", [randomUUID(), tenantId, code, code === "tech" ? "Tech" : "Fiscal", "#5369cf"]);
// Override proposital: mesmo assim o módulo precisa continuar exclusivo do Tech.
await db.query("INSERT INTO tenant_modules (id,tenantId,moduleCode,enabled,sectorCode,updatedAt) VALUES (?,?,?,true,'fiscal',NOW(3))", [randomUUID(), tenantId, "tech_github_contributions"]);
await db.query("INSERT INTO tenant_integrations (id,tenantId,integrationCode,instanceKey,enabled,configEnc,updatedAt) VALUES (?,?,'github','default',true,?,NOW(3))", [integrationId, tenantId, configEnc]);
await db.query("INSERT INTO github_connections (id,tenantId,integrationId,githubUserId,login,status,generation,verifiedAt,inventoryAt,nextSyncAt,updatedAt) VALUES (?,?,?,?,?,'connected',1,NOW(3),NOW(3),?,NOW(3))", [connectionId, tenantId, integrationId, accountId, "equipe-ficticia", new Date(Date.now() + 3600000)]);
for (const repo of repositories) {
  await db.query("INSERT INTO github_repositories (id,tenantId,connectionId,externalId,owner,name,fullName,defaultBranch,private,selected,`accessible`,accessCheckedAt) VALUES (?,?,?,?,?,?,?,'main',?,true,true,NOW(3))", [repo.id, tenantId, connectionId, repo.node_id, repo.owner.login, repo.name, repo.full_name, repo.private]);
  for (const resource of types) {
    const cursor = JSON.stringify({ lastHead: "a".repeat(40), lastFullAt: now.toISOString(), ...(resource === "REVIEW" ? { pullNumber: 1 } : {}) });
    await db.query("INSERT INTO github_sync_jobs (id,tenantId,connectionId,repositoryId,`key`,resource,state,generation,`cursor`,coveredFrom,coveredThrough,updatedAt) VALUES (?,?,?,?,?,?,'done',1,?,?,?,NOW(3))", [randomUUID(), tenantId, connectionId, repo.id, `${repo.id}:${resource}${resource === "REVIEW" ? ":1" : ""}`, resource, cursor, from, now]);
  }
}
for (const [index, login] of ["ana-dev", "bruno-dev", "carla-review", "sem-atividade"].entries()) {
  const userId = randomUUID();
  await db.query("INSERT INTO github_users (id,tenantId,connectionId,externalId,login,tracked) VALUES (?,?,?,?,?,?)", [userId, tenantId, connectionId, `U_ui_${login}`, login, index === 3]);
  if (index === 3) continue;
  for (let item = 0; item < 40; item++) {
    const occurredAt = new Date(now.getTime() - (item * 3 + index + 1) * 86400000), day = dayAt(occurredAt), type = types[(item + index) % 4], repo = repositories[item % 2];
    const externalId = createHash("sha1").update(`${login}:${item}`).digest("hex");
    const link = `https://github.com/${repo.full_name}/${type === "COMMIT" ? `commit/${externalId}` : type === "ISSUE" ? `issues/${item + 1}` : `pull/${item + 1}`}`;
    await db.query("INSERT INTO github_contributions (id,tenantId,repositoryId,userId,type,externalId,occurredAt,day,url,number,title) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [randomUUID(), tenantId, repo.id, userId, type, externalId, occurredAt, day, link, type === "COMMIT" || type === "REVIEW" ? null : item + 1, type === "REVIEW" ? null : `fix: ajuste fictício ${item + 1}`]);
    await db.query("INSERT INTO github_daily_contributions (id,tenantId,repositoryId,userId,day,type,`count`) VALUES (?,?,?,?,?,?,1)", [randomUUID(), tenantId, repo.id, userId, day, type]);
  }
}
// Volume representativo: vinte usuários com um ano de calendário cada.
for (let index = 0; index < 16; index++) await db.query("INSERT INTO github_users (id,tenantId,connectionId,externalId,login,tracked) VALUES (?,?,?,?,?,true)", [randomUUID(), tenantId, connectionId, `U_volume_${index}`, `zz-volume-${String(index).padStart(2, "0")}`]);
// O painel lê só quem vinculou a conta em Sua conta (27/10/2026): cada login fictício ganha
// uma pessoa do Connect vinculada, e o nome aparece ao lado do login.
for (const [externalId, login] of (await db.query("SELECT externalId, login FROM github_users WHERE tenantId = ?", [tenantId])).map(row => [row.externalId, row.login])) {
  const personId = randomUUID();
  await db.query("INSERT INTO users (id,tenantId,name,email,passwordHash,role,updatedAt) VALUES (?,?,?,?,?,?,NOW(3))", [personId, tenantId, `Pessoa ${login}`, `${personId}@example.test`, "sem-login-real", "SECTOR_USER"]);
  await db.query("INSERT INTO github_account_links (id,tenantId,userId,externalId,login) VALUES (?,?,?,?,?)", [randomUUID(), tenantId, personId, externalId, login]);
}
// Liberação controlada no cenário de retomada abaixo; o cron precisa respeitá-la.
await db.query("INSERT INTO github_account_leases (githubUserId,nextAttemptAt) VALUES (?,?)", [accountId, new Date(Date.now() + 3600000)]);
const hook = path.join(output, "fixture-fetch.mjs");
await writeFile(hook, `if (process.env.GITHUB_UI_FIXTURE !== "1" || new URL(process.env.DATABASE_URL).port !== "33381") throw new Error("Fixture recusada");
const original = globalThis.fetch; const repos = ${JSON.stringify(repositories)}; const accountId = ${JSON.stringify(accountId)};
globalThis.fetch = async (input, init) => {
 const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
 if (url.origin === "https://github.com" && url.pathname === "/login/oauth/access_token") return Response.json({ access_token: "ui-new-fake-token", scope: "repo,read:user" });
 if (url.origin !== "https://api.github.com") return original(input, init);
 if (url.pathname === "/user") return Response.json({ node_id: accountId, login: "equipe-ficticia", type: "User" });
 if (url.pathname === "/user/repos") return Response.json(repos);
 if (url.pathname.startsWith("/users/")) return Response.json({ node_id: "U_ui_" + url.pathname.split("/").at(-1), login: url.pathname.split("/").at(-1), type: "User" });
 if (url.pathname.includes("/compare/")) return Response.json({ status: "identical", commits: [] });
 for (const repo of repos) {
   if (url.pathname === "/repos/" + repo.full_name) return Response.json(repo);
   if (url.pathname.startsWith("/repos/" + repo.full_name + "/")) {
     if (url.pathname.endsWith("/commits") && url.searchParams.get("per_page") === "1") return Response.json([{ sha: "a".repeat(40) }]);
     return Response.json([]);
   }
 }
 return Response.json({ message: "Fixture não encontrada" }, { status: 404 });
};`);
const system = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "COMSPEC", "PATHEXT"].flatMap(name => process.env[name] ? [[name, process.env[name]]] : []));
const env = { ...system, TZ: "UTC", DATABASE_URL: target.toString(), NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", APP_PUBLIC_URL: base, APP_DOMAIN: "", NEXT_TELEMETRY_DISABLED: "1",
  JWT_ACCESS_SECRET: secret, JWT_REFRESH_SECRET: secret + "-refresh", SECRETS_ENCRYPTION_KEY: encryption, GITHUB_UI_FIXTURE: "1" };
log = await open(path.join(output, "ui-server.log"), "w");
server = spawn(process.execPath, ["--import", pathToFileURL(hook).href, executable], { cwd: path.dirname(executable), env, windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
  let ready = false;
  for (let index = 0; index < 60; index++) { if (server.exitCode !== null) throw new Error("Standalone encerrou. Confira .local/github/ui-server.log."); try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 1000)); }
  assert.ok(ready, "Standalone precisa responder.");
  const installed = await access(chromium.executablePath()).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(installed ? {} : { channel: "msedge" }) });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const cookie = (id, role = "ADMIN", sectors = ["tech"]) => ({ name: "access_token", value: jwt.sign({ sub: id, tenantId, role, sectors, accessibleTenants: [tenantId] }, secret, { expiresIn: "30m" }), url: base, httpOnly: true, sameSite: "Lax" });
  await context.addCookies([cookie(adminId), { name: "active_sector_code", value: "tech", url: base }]); page = await context.newPage(); page.setDefaultTimeout(30000);
  // A sessão é assinada pela fixture; não há refresh token de uma pessoa real.
  await page.route(base + "/api/auth/refresh", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
  page.on("pageerror", error => result.browserErrors.push(error.message));
  const api = async (route = "/api/github") => { const response = await context.request.get(base + route); assert.ok(response.ok(), `${response.status()} ${await response.text()}`); return response.json(); };
  const datesFit = async () => {
    for (const name of ["De", "Até"]) {
      const field = page.getByRole("combobox", { name, exact: true });
      const boxes = await field.evaluate(element => ({ input: element.getBoundingClientRect().toJSON(), label: element.closest("label").getBoundingClientRect().toJSON() }));
      assert.ok(boxes.input.right <= boxes.label.right + 1 && boxes.input.left >= boxes.label.left - 1, `Campo ${name} deve caber no rótulo`);
    }
  };
  await page.goto(base + "/github");
  await page.getByRole("heading", { name: "GitHub — Contribuições", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Atividade recente", exact: true }).waitFor();
  const overview = await api("/api/github?view=general");
  assert.equal(overview.summary.counts.COMMIT, 30); assert.equal(overview.summary.counts.PULL_REQUEST, 30);
  assert.equal(overview.summary.counts.REVIEW, 30); assert.equal(overview.summary.activeDevelopers, 3);
  assert.equal(overview.summary.recent.length, 8); assert.equal(overview.summary.leaders.length, 3);
  assert.equal(await page.getByRole("group", { name: /^Calendário de / }).count(), 0);
  await page.getByRole("img", { name: /^Cadência de / }).waitFor();
  await datesFit();
  await page.screenshot({ path: path.join(output, "github-geral.png"), fullPage: true, animations: "disabled" });
  for (const [label, width, height] of [["geral-200", 683, 384], ["geral-mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await datesFit();
    await page.screenshot({ path: path.join(output, `github-${label}.png`), fullPage: true, animations: "disabled" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), label);
    await page.getByRole("heading", { name: "Cadência de entregas", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `github-${label}-chart.png`), fullPage: true, animations: "disabled" });
    await page.getByRole("heading", { name: "GitHub — Contribuições", exact: true }).scrollIntoViewIfNeeded();
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("button", { name: "GitHub", exact: true }).click();
  const githubMenu = page.getByRole("menu", { name: "GitHub", exact: true });
  await githubMenu.getByRole("menuitem", { name: "Geral", exact: true }).waitFor();
  await githubMenu.getByRole("menuitem", { name: "Desenvolvedores", exact: true }).click();
  await page.waitForURL(/github\/desenvolvedores/);
  ok("Geral usa totais reais, gráfico e atividades recentes; abas funcionam em desktop e celular");
  const renderStart = performance.now();
  await page.goto(base + "/github/desenvolvedores"); await page.getByText("ana-dev", { exact: true }).waitFor();
  assert.equal((await api()).total, 120);
  const renderedDays = await page.locator("button[data-level]").count();
  assert.equal((await api()).totalUsers, 20);
  // Calendário leve (27/10/2026): só os dias com contribuição são elementos; os vazios são o fundo da grade.
  assert.ok(renderedDays > 0 && renderedDays < 20 * 300, "Dias vazios não devem virar elementos");
  assert.equal(await page.locator('[role="group"][aria-label^="Calendário de "] span[title]').count(), 0, "Dias vazios não têm elemento próprio");
  await page.getByText("ana-dev — Pessoa ana-dev", { exact: true }).waitFor();
  result.performance = { users: 20, mountedDayButtons: renderedDays, eagerDayButtons: 20 * 366, firstViewMs: Math.round(performance.now() - renderStart) };
  result.performance.firstLoad = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0], resources = performance.getEntriesByType("resource");
    const scripts = resources.filter(resource => resource.initiatorType === "script");
    const api = resources.find(resource => new URL(resource.name).pathname === "/api/github");
    return { documentTtfbMs: Math.round(navigation.responseStart - navigation.requestStart), apiMs: api ? Math.round(api.duration) : null,
      scriptCount: scripts.length, scriptTransferBytes: scripts.reduce((sum, resource) => sum + resource.transferSize, 0), scriptDecodedBytes: scripts.reduce((sum, resource) => sum + resource.decodedBodySize, 0) };
  });
  const cdp = await context.newCDPSession(page); await cdp.send("Performance.enable");
  const scrollStart = performance.now();
  for (const group of await page.getByRole("group", { name: /^Calendário de / }).all()) {
    await group.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  await page.waitForTimeout(150);
  result.performance.afterScrollDayButtons = await page.locator("button[data-level]").count();
  result.performance.liveDomNodes = await page.locator("*").count();
  result.performance.scrollMs = Math.round(performance.now() - scrollStart);
  await cdp.send("HeapProfiler.collectGarbage");
  const metrics = (await cdp.send("Performance.getMetrics")).metrics;
  result.performance.domNodes = metrics.find(metric => metric.name === "Nodes")?.value;
  result.performance.heapBytes = metrics.find(metric => metric.name === "JSHeapUsedSize")?.value;
  // Sem polling desde 26/10/2026: voltar à aba não consulta o painel de novo.
  let reloads = 0; const countReload = request => { if (new URL(request.url()).pathname === "/api/github") reloads++; };
  page.on("request", countReload);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await page.waitForTimeout(500);
  page.off("request", countReload); result.performance.reloadsOnVisibility = reloads;
  if (process.env.GITHUB_PERF_BASELINE !== "1") {
    assert.equal(result.performance.afterScrollDayButtons, renderedDays, "A rolagem não monta nem desmonta calendários");
    assert.equal(reloads, 0, "Voltar à aba não deve recarregar o painel");
  }
  await page.getByRole("group", { name: "Calendário de ana-dev", exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole("group", { name: "Calendário de ana-dev", exact: true }).locator("button[data-level]").first().waitFor();
  ok("Vinte usuários com calendários leves, sem montar ou desmontar na rolagem");
  await page.getByRole("group", { name: "Calendário de sem-atividade", exact: true }).waitFor(); ok("Calendários individuais, quatro tipos e usuário sem atividade");
  await page.screenshot({ path: path.join(output, "github-desktop.png"), fullPage: true, animations: "disabled" });
  const calendar = page.getByRole("group", { name: "Calendário de ana-dev", exact: true });
  const first = calendar.locator("button[data-level]").first(); await first.focus(); await first.press("ArrowDown");
  assert.notEqual(await first.evaluate(element => element === document.activeElement), true); ok("Navegação por teclado no calendário");
  await calendar.locator("button[data-level]").first().focus();
  await calendar.locator("button[data-level]").first().press("End");
  assert.equal(await calendar.locator("button[data-level]").last().evaluate(element => element === document.activeElement), true);
  ok("Home/End andam entre os dias com contribuição");
  await calendar.locator('button[data-level]:not([data-level="0"])').first().click();
  await page.getByRole("dialog").getByRole("link", { name: /Abrir no GitHub/ }).first().waitFor();
  assert.ok(await page.getByRole("dialog").locator("code").count() > 0, "O detalhe mostra o SHA curto ou o número");
  await page.screenshot({ path: path.join(output, "github-day.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click(); ok("Detalhe diário consulta os eventos e links que formam a contagem");
  assert.equal(await page.getByRole("button", { name: /^(Filtros|Aplicar filtros|Atualizar dados)$/ }).count(), 0);
  await page.getByRole("searchbox", { name: "Buscar desenvolvedor", exact: true }).fill("ana");
  await page.waitForURL(url => url.searchParams.get("user") === "ana"); await page.getByRole("button", { name: "Limpar", exact: true }).waitFor();
  assert.equal((await api("/api/github?type=REVIEW")).total, 30); ok("Busca se aplica sozinha, persiste na URL e os totais por tipo conferem");
  await page.goto(base + "/github/desenvolvedores?type=REVIEW"); await page.getByRole("button", { name: "Limpar", exact: true }).waitFor();
  await page.getByRole("navigation", { name: "GitHub", exact: true }).getByRole("link", { name: "Geral", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/github" && url.searchParams.get("type") === "REVIEW");
  await page.getByRole("heading", { name: "Atividade recente", exact: true }).waitFor();
  const filteredOverview = await api("/api/github?view=general&type=REVIEW");
  assert.equal(filteredOverview.summary.counts.COMMIT, 0); assert.equal(filteredOverview.summary.counts.REVIEW, 30);
  await page.getByRole("navigation", { name: "GitHub", exact: true }).getByRole("link", { name: "Desenvolvedores", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/github/desenvolvedores" && url.searchParams.get("type") === "REVIEW");
  ok("Menu lateral abre as duas opções e as abas preservam os filtros");
  await page.goto(base + "/github/repositorios"); await page.getByRole("heading", { name: "alpha/app" }).waitFor();
  const repositoriesView = await api("/api/github?view=repositories");
  assert.equal(repositoriesView.totalRepositories, 2); assert.ok(repositoriesView.repositories.every(repo => repo.contributors.length > 0));
  await page.getByRole("button", { name: "Mostrar todos", exact: true }).click(); await page.waitForURL(url => url.searchParams.get("all") === "1");
  await page.getByRole("button", { name: "Mostrar todos", exact: true }).click(); await page.waitForURL(url => !url.searchParams.has("all"));
  ok("Repositórios mostram o calendário e a parte de cada desenvolvedor; Mostrar todos liga e desliga");
  await page.goto(base + "/github/desenvolvedores"); await page.getByText("ana-dev", { exact: true }).waitFor();
  for (const [label, width, height] of [["125", 1093, 614], ["150", 911, 512], ["200", 683, 384], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height }); await datesFit(); await page.screenshot({ path: path.join(output, `github-${label}.png`), fullPage: true, animations: "disabled" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Sem vazamento lateral em ${label}`);
  }
  ok("Layout em celular e áreas úteis equivalentes a 125%, 150% e 200%");
  await page.setViewportSize({ width: 1366, height: 768 }); await context.addCookies([{ name: "theme", value: "dark", url: base }]); await page.reload(); await page.getByText("ana-dev", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "github-dark.png"), fullPage: true, animations: "disabled" });
  await page.goto(base + "/admin/integracoes?integracao=github"); await page.getByText("Conta: equipe-ficticia", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Client ID", { exact: true }).inputValue(), "ui-fake-client");
  assert.equal(await page.getByLabel(/^Client Secret/).inputValue(), "");
  assert.equal(await page.getByLabel(/^Authorization callback URL/).inputValue(), base + "/api/integrations/github/callback");
  const configView = await api("/api/github/integration");
  assert.equal(configView.hasClientSecret, true); assert.ok(!JSON.stringify(configView).includes("ui-fake-secret"));
  await page.getByRole("button", { name: "Salvar credenciais", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Credenciais salvas" }).waitFor();
  assert.equal((await api("/api/github/integration")).connected, true);
  ok("Formulário de OAuth mostra callback e Client ID, oculta segredo e preserva conexão ao salvar sem alterações");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, "github-oauth-mobile.png"), fullPage: true, animations: "disabled" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: path.join(output, "github-integration.png"), fullPage: true, animations: "disabled" });
  const beta = page.locator("label").filter({ hasText: "beta/tools" }); await beta.getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Salvar e sincronizar", exact: true }).click();
  await page.waitForResponse(response => response.url().endsWith("/api/github/integration") && response.request().method() === "GET" && response.ok());
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByRole("button", { name: "Retomar", exact: true }).waitFor();
  const paused = await api(); assert.equal(paused.enabled, false); assert.equal(paused.total, 60); ok("Integrações salva seleção, pausa a coleta e preserva o histórico selecionado");
  await page.getByRole("button", { name: "Retomar", exact: true }).click();
  await page.getByRole("button", { name: "Pausar", exact: true }).waitFor();
  await page.goto("about:blank");
  await db.query("UPDATE github_account_leases SET nextAttemptAt=NULL WHERE githubUserId=?", [accountId]);
  let remaining = 1;
  for (let attempt = 0; attempt < 90; attempt++) {
    remaining = Number((await db.query("SELECT COUNT(*) n FROM github_sync_jobs j JOIN github_connections c ON c.id=j.connectionId WHERE c.id=? AND j.generation=c.generation AND j.state='queued'", [connectionId]))[0].n);
    if (!remaining) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(remaining, 0, "O servidor deve concluir a fila sem uma página Connect aberta");
  assert.ok(Number((await db.query("SELECT COUNT(*) n FROM integration_runs WHERE integrationId=? AND `trigger`='CRON' AND ok=true", [integrationId]))[0].n) > 0);
  ok("Standalone conclui a fila em segundo plano com o navegador em about:blank");
  await page.goto(base + "/admin/integracoes?integracao=github");
  await page.getByRole("link", { name: "Reconectar / trocar conta", exact: true }).waitFor();
  let authorization;
  await page.route(base + "/api/integrations/github/connect", async route => {
    const response = await route.fetch({ maxRedirects: 0 });
    authorization = new URL(response.headers().location);
    assert.equal(authorization.origin, "https://github.com");
    const headers = { ...response.headers(), "content-type": "text/html; charset=utf-8" }; delete headers.location;
    await route.fulfill({ status: 200, headers, body: "<p>Autorização fictícia GitHub</p>" });
  });
  await page.getByRole("link", { name: "Reconectar / trocar conta", exact: true }).click(); await page.getByText("Autorização fictícia GitHub", { exact: true }).waitFor();
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  await page.goto(`${base}/api/integrations/github/callback?state=${encodeURIComponent(authorization.searchParams.get("state"))}&code=fixture-code`);
  await page.waitForURL(/connected=github/); await page.getByText("Conta GitHub conectada com sucesso.", { exact: true }).waitFor(); ok("OAuth com PKCE inicia e retorna pelo painel de Integrações usando GitHub simulado");
  assert.equal(authorization.searchParams.get("client_id"), "ui-fake-client");
  await page.getByLabel(/^Client Secret/).fill("ui-updated-secret");
  await page.getByRole("button", { name: "Salvar credenciais", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Credenciais salvas" }).waitFor();
  assert.equal(await page.getByLabel(/^Client Secret/).inputValue(), "");
  assert.equal((await api("/api/github/integration")).connected, false);
  assert.ok(await page.getByRole("link", { name: "Conectar GitHub", exact: true }).isVisible());
  ok("Troca do segredo pela página remove tokens e exige nova autorização sem expor o segredo");
  const fiscalContext = await browser.newContext(); await fiscalContext.addCookies([cookie(fiscalId, "SECTOR_USER", ["fiscal"])]);
  assert.equal((await fiscalContext.request.get(base + "/api/github")).status(), 403); await fiscalContext.close();
  const techContext = await browser.newContext(); await techContext.addCookies([cookie(techId, "SECTOR_USER", ["tech"])]);
  assert.equal((await techContext.request.get(base + "/api/github")).status(), 200);
  assert.equal((await techContext.request.post(base + "/api/github/sync", { data: { action: "queue" } })).status(), 403);
  await techContext.close(); ok("Exclusivo do Tech mesmo com override de setor; consulta não concede gestão");
  assert.deepEqual(result.browserErrors, []); ok("Sem erros de navegador");
} catch (error) {
  if (page) { await page.screenshot({ path: path.join(output, "github-failure.png"), fullPage: true }).catch(() => {}); await writeFile(path.join(output, "ui-error.txt"), await page.locator("body").innerText().catch(() => "Página indisponível")); }
  throw error;
} finally {
  await writeFile(path.join(output, "ui-result.json"), JSON.stringify(result, null, 2));
  if (process.env.GITHUB_PERF_BASELINE === "1") await writeFile(path.join(output, "performance-before.json"), JSON.stringify(result.performance ?? {}, null, 2));
  await browser?.close(); server?.kill();
  await db.query("DELETE FROM github_oauth_attempts WHERE tenantId=?", [tenantId]);
  await db.query("DELETE FROM tenant_integrations WHERE tenantId=?", [tenantId]);
  await db.query("DELETE FROM audit_logs WHERE tenantId=?", [tenantId]);
  await db.query("DELETE FROM user_sectors WHERE userId IN (?,?,?)", [adminId, techId, fiscalId]);
  await db.query("DELETE FROM users WHERE tenantId=?", [tenantId]);
  await db.query("DELETE FROM tenant_modules WHERE tenantId=?", [tenantId]);
  await db.query("DELETE FROM sectors WHERE tenantId=?", [tenantId]);
  await db.query("DELETE FROM tenants WHERE id=?", [tenantId]);
  await db.query("DELETE FROM github_account_leases WHERE githubUserId=?", [accountId]);
  await db.end(); await log?.close();
}
