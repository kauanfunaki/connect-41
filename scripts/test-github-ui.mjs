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

const target = new URL(process.env.GITHUB_TEST_DATABASE_URL ?? "http://invalid");
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "33381" || target.pathname !== "/connect41") throw new Error("Defina GITHUB_TEST_DATABASE_URL para o banco descartável em 127.0.0.1:33381/connect41.");
const output = path.resolve(".local/github"); await mkdir(output, { recursive: true });
const { workspace } = JSON.parse(await readFile(path.join(output, "build-workspace.json"), "utf8"));
if (path.dirname(path.resolve(workspace)) !== output || !path.basename(workspace).startsWith("build-")) throw new Error("Build de verificação inválido.");
const executable = path.join(workspace, ".next/standalone/server.js"); await access(executable);
const port = await new Promise((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const base = `http://127.0.0.1:${port}`, secret = "github-ui-fixture-session", encryption = "github-ui-fixture-encryption";
const db = await mariadb.createConnection({ host: target.hostname, port: 33381, user: decodeURIComponent(target.username), password: decodeURIComponent(target.password), database: "connect41", allowPublicKeyRetrieval: true });
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
    await db.query("INSERT INTO github_contributions (id,tenantId,repositoryId,userId,type,externalId,occurredAt,day,url,number) VALUES (?,?,?,?,?,?,?,?,?,?)", [randomUUID(), tenantId, repo.id, userId, type, externalId, occurredAt, day, link, type === "COMMIT" || type === "REVIEW" ? null : item + 1]);
    await db.query("INSERT INTO github_daily_contributions (id,tenantId,repositoryId,userId,day,type,`count`) VALUES (?,?,?,?,?,?,1)", [randomUUID(), tenantId, repo.id, userId, day, type]);
  }
}
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
const env = { ...system, DATABASE_URL: target.toString(), NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", APP_PUBLIC_URL: base, APP_DOMAIN: "", NEXT_TELEMETRY_DISABLED: "1",
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
  await context.addCookies([cookie(adminId)]); page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on("pageerror", error => result.browserErrors.push(error.message));
  const api = async (route = "/api/github") => { const response = await context.request.get(base + route); assert.ok(response.ok(), `${response.status()} ${await response.text()}`); return response.json(); };
  await page.goto(base + "/github"); await page.getByText("ana-dev", { exact: true }).waitFor();
  assert.equal((await api()).total, 120); assert.equal((await api()).complete, true);
  await page.getByRole("group", { name: "Calendário de sem-atividade", exact: true }).waitFor(); ok("Calendários individuais, quatro tipos, cobertura e usuário sem atividade");
  await page.screenshot({ path: path.join(output, "github-desktop.png"), fullPage: true, animations: "disabled" });
  const calendar = page.getByRole("group", { name: "Calendário de ana-dev", exact: true });
  const first = calendar.locator("button[data-level]").first(); await first.focus(); await first.press("ArrowDown");
  assert.notEqual(await first.evaluate(element => element === document.activeElement), true); ok("Navegação por teclado no calendário");
  await calendar.locator('button[data-level]:not([data-level="0"])').first().click();
  await page.getByRole("dialog").getByRole("link", { name: /Abrir no GitHub/ }).first().waitFor();
  await page.screenshot({ path: path.join(output, "github-day.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click(); ok("Detalhe diário consulta os eventos e links que formam a contagem");
  await page.getByRole("combobox", { name: "Tipo de contribuição", exact: true }).click(); await page.getByRole("option", { name: "Revisões", exact: true }).click();
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click(); await page.waitForURL(/type=REVIEW/);
  assert.equal((await api("/api/github?type=REVIEW")).total, 30); ok("Filtros persistem na URL e os totais por tipo conferem");
  await page.goto(base + "/github"); await page.getByText("ana-dev", { exact: true }).waitFor();
  for (const [label, width, height] of [["125", 1093, 614], ["150", 911, 512], ["200", 683, 384], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height }); await page.screenshot({ path: path.join(output, `github-${label}.png`), fullPage: true, animations: "disabled" });
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
