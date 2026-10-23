// Navegador real com dados fictícios, sem integrações ou pastas de rede reais.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, open, writeFile, access } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import mariadb from "mariadb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";

const url = process.env.OPS_TEST_DATABASE_URL;
if (!url) throw new Error("Defina OPS_TEST_DATABASE_URL para localhost:33379/connect41 descartável.");
const target = new URL(url);
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "33379" || target.pathname !== "/connect41") throw new Error("Banco não isolado recusado.");
const root = process.cwd(), output = path.join(root, ".local/tech-ops-entrega"); await mkdir(output, { recursive: true });
const { workspace } = JSON.parse(await readFile(".local/ops/build-workspace.json", "utf8"));
const serverFile = path.join(workspace, ".next/standalone/server.js"); await access(serverFile);
const db = await mariadb.createConnection({ host: target.hostname, port: 33379, user: decodeURIComponent(target.username), password: decodeURIComponent(target.password), database: "connect41", allowPublicKeyRetrieval: true });
const tenantId = randomUUID(), userId = randomUUID(), readonlyId = randomUUID(), fiscalId = randomUUID();
const email = `${userId}@example.test`, password = randomUUID() + "Aa1!", hash = await bcrypt.hash(password, 4);
await db.query("INSERT INTO tenants (id,name,slug,updatedAt) VALUES (?,?,?,NOW(3))", [tenantId, "Escritório fictício Tech e Contábil", tenantId]);
for (const [id, name, role, sector] of [[userId, "Administrador fictício", "ADMIN", "tech"], [readonlyId, "Leitura fictícia", "READONLY", "tech"], [fiscalId, "Fiscal fictício", "SECTOR_USER", "fiscal"]]) {
  await db.query("INSERT INTO users (id,tenantId,name,email,passwordHash,role,updatedAt) VALUES (?,?,?,?,?,?,NOW(3))", [id, tenantId, name, id === userId ? email : `${id}@example.test`, hash, role]);
  await db.query("INSERT INTO user_sectors (userId,sectorCode) VALUES (?,?)", [id, sector]);
}
for (const sector of ["tech", "contabil", "fiscal"]) await db.query("INSERT INTO sectors (id,tenantId,code,label,color,updatedAt) VALUES (?,?,?,?,?,NOW(3))", [randomUUID(), tenantId, sector, sector, "#5369cf"]);
await db.query("INSERT INTO user_sectors (userId,sectorCode) VALUES (?,'contabil')", [userId]);
for (const code of ["tech_controle_interno", "tech_ops_center"]) await db.query("INSERT INTO tenant_modules (id,tenantId,moduleCode,enabled,updatedAt) VALUES (?,?,?,true,NOW(3))", [randomUUID(), tenantId, code]);
const dated = randomUUID(), undated = randomUUID();
for (const [id, title, dueDate] of [[dated, "Bug com prazo fictício", "2026-10-23"], [undated, "Melhoria sem prazo fictícia", null]]) await db.query("INSERT INTO tech_internal_items (id,tenantId,title,type,priority,status,systemMode,dueDate,version,updatedAt) VALUES (?,?,?,'BUG',1,'PENDING','NONE',?,0,NOW(3))", [id, tenantId, title, dueDate]);
await db.query("INSERT INTO ops_watchers (tenantId,slug,name,isActive,version,updatedAt) VALUES (?,'bot_ficticio','Bot fictício',true,0,NOW(3))", [tenantId]);
const secret = "teste-local-tech-ops-sem-integracoes-33383", base = "http://127.0.0.1:33383";
const system = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "COMSPEC", "PATHEXT"].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
const env = { ...system, DATABASE_URL: url, NODE_ENV: "production", PORT: "33383", HOSTNAME: "127.0.0.1", APP_PUBLIC_URL: base, APP_DOMAIN: "", SECTOR_HOST_SUFFIX: "", SECTOR_HOST_SUFFIX_ANTIGO: "", GITHUB_SYNC_ENABLED: "false", JWT_ACCESS_SECRET: secret, JWT_REFRESH_SECRET: `${secret}-refresh`, SECRETS_ENCRYPTION_KEY: "segredo-ficticio-local", NEXT_TELEMETRY_DISABLED: "1" };
const log = await open(path.join(output, "servidor.log"), "w");
const server = spawn(process.execPath, [serverFile], { cwd: path.dirname(serverFile), env, windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
let browser, page; const results = { sucesso: false, validacoes: [], errosDeNavegador: [] };
const ok = label => { results.validacoes.push(label); console.log("OK: " + label); };
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("Servidor encerrou.");
    try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, "Servidor deve responder");
  const installed = await access(chromium.executablePath()).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(installed ? {} : { channel: "msedge" }) });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } }); page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on("pageerror", e => results.errosDeNavegador.push(e.message));
  await page.goto(base + "/login?next=/tech/controle-interno");
  await page.locator('input[name="email"]').fill(email); await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("heading", { name: "Controle interno", exact: true }).waitFor(); ok("Login real e entrada no Controle interno");
  await page.getByRole("link", { name: "Novo item", exact: true }).click();
  await page.getByLabel(/^Título/).fill("Novo item pelo navegador");
  await page.getByRole("combobox", { name: /^Tipo/ }).click(); await page.getByRole("option", { name: "Melhoria", exact: true }).click();
  await page.getByRole("button", { name: "Criar item", exact: true }).click();
  await page.getByRole("heading", { name: "Novo item pelo navegador", exact: true }).waitFor(); ok("Criação de item pelo formulário");
  await page.goto(base + "/tech/controle-interno?visao=kanban&situacao=ALL");
  const kanban = page.getByLabel("Kanban do Tech", { exact: true });
  await kanban.getByRole("link", { name: "Bug com prazo fictício", exact: true }).waitFor();
  await page.getByRole("combobox", { name: "Situação de Bug com prazo fictício", exact: true }).click(); await page.getByRole("option", { name: "Em andamento", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 60000 });
  await page.getByRole("region", { name: "Em andamento", exact: true }).getByRole("link", { name: "Bug com prazo fictício", exact: true }).waitFor();
  const rows = await db.query("SELECT status,version FROM tech_internal_items WHERE id=?", [dated]); assert.equal(rows[0].status, "IN_PROGRESS"); assert.equal(rows[0].version, 1); ok("Kanban persiste situação e histórico");
  await page.screenshot({ path: path.join(output, "tech-kanban.png"), fullPage: true });
  await page.goto(base + "/tech/controle-interno?visao=agenda&mes=2026-10&situacao=ALL");
  await page.getByRole("region", { name: "2026-10-23", exact: true }).getByRole("link", { name: "Bug com prazo fictício", exact: true }).waitFor();
  await page.getByRole("region", { name: "Itens sem prazo", exact: true }).getByRole("link", { name: "Melhoria sem prazo fictícia", exact: true }).waitFor();
  await page.getByRole("link", { name: "Próximo mês", exact: true }).click(); await page.waitForURL(/mes=2026-11/);
  await page.getByText("Nenhum prazo neste mês e neste recorte.", { exact: true }).waitFor(); ok("Agenda por mês e itens sem prazo");
  await page.goto(base + "/admin/integracoes?integracao=ops_center");
  await page.getByRole("heading", { name: "Chaves adicionais", exact: true }).waitFor();
  const createKey = async name => { await page.getByLabel("Nome da chave", { exact: true }).fill(name); await page.getByRole("button", { name: "Adicionar chave", exact: true }).click(); await page.getByLabel(`${name} — copie agora; esta chave aparece uma única vez`, { exact: true }).waitFor(); return page.locator("#ops-extra-token").inputValue(); };
  const a = await createKey("Servidor A"), b = await createKey("Servidor B");
  assert.notEqual(a, b); assert.match(a, /^ops_[a-f0-9]{64}$/);
  const heartbeat = token => context.request.post(base + "/api/ops/watchers/bot_ficticio/heartbeat", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await heartbeat(a)).status(), 200); assert.equal((await heartbeat(b)).status(), 200);
  const keyRow = page.getByRole("listitem").filter({ hasText: "Servidor A" }); await keyRow.getByRole("button", { name: "Revogar", exact: true }).click(); await page.getByRole("alertdialog").getByRole("button", { name: "Revogar chave", exact: true }).click();
  await keyRow.getByText(/Revogada/).waitFor(); assert.equal((await heartbeat(a)).status(), 401); assert.equal((await heartbeat(b)).status(), 200);
  await page.reload(); await page.getByRole("heading", { name: "Chaves adicionais", exact: true }).waitFor(); assert.equal(await page.locator("#ops-extra-token").count(), 0); ok("Duas chaves pela tela, revogação independente e segredo mostrado uma vez");
  await page.screenshot({ path: path.join(output, "ops-chaves.png"), fullPage: true });
  await page.goto(base + "/setor/contabil/telas"); await page.locator('a[href="/setor/contabil/contabil_sped"]').first().click(); await page.getByRole("heading", { name: "SPED contábil", exact: true }).waitFor();
  await page.getByText(/Configure e ative a integração SPED Generator/).waitFor(); ok("SPED disponível no setor Contábil e informa integração ausente");
  const cookie = (id, role, sectors) => ({ name: "access_token", value: jwt.sign({ sub: id, tenantId, role, sectors, accessibleTenants: [tenantId] }, secret, { expiresIn: "30m" }), url: base, httpOnly: true, sameSite: "Lax" });
  const readContext = await browser.newContext(); await readContext.addCookies([cookie(readonlyId, "READONLY", ["tech"])]); const readPage = await readContext.newPage(); await readPage.goto(base + "/tech/controle-interno?visao=kanban"); await readPage.getByLabel("Kanban do Tech", { exact: true }).waitFor(); assert.equal(await readPage.getByLabel("Kanban do Tech", { exact: true }).getByRole("combobox").count(), 0); assert.equal(await readPage.getByRole("link", { name: "Novo item", exact: true }).count(), 0); await readContext.close(); ok("Somente leitura consulta Kanban sem ações de escrita");
  const other = await browser.newContext(); await other.addCookies([cookie(fiscalId, "SECTOR_USER", ["fiscal"])]); const otherPage = await other.newPage();
  for (const route of ["/tech/controle-interno", "/contabil/sped"]) { await otherPage.goto(base + route); await otherPage.getByText(/^Página não encontrada\.?$/).waitFor(); }
  assert.equal((await other.request.get(base + "/api/contabil/sped/contexto")).status(), 404); await other.close(); ok("Outro setor não abre Tech nem Contábil");
  for (const view of ["lista", "kanban", "agenda"]) {
    await page.goto(base + `/tech/controle-interno?visao=${view}&mes=2026-10`); await page.getByRole("heading", { name: "Controle interno", exact: true }).waitFor(); await page.getByRole("link", { name: "Bug com prazo fictício", exact: true }).first().waitFor();
    for (const width of [1366, 683, 390]) { await page.setViewportSize({ width, height: 768 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Sem overflow em ${view}/${width}`); }
  }
  await context.addCookies([{ name: "theme", value: "dark", url: base }]); await page.reload(); await page.getByRole("link", { name: "Bug com prazo fictício", exact: true }).first().waitFor(); await page.getByLabel("Itens sem prazo", { exact: true }).waitFor(); await page.screenshot({ path: path.join(output, "tech-agenda-mobile.png"), fullPage: true, animations: "disabled" }); ok("Lista, Kanban e agenda responsivos, incluindo tema escuro");
  assert.deepEqual(results.errosDeNavegador, []); results.sucesso = true;
} catch (error) { console.error("Etapa interrompida em", page?.url()); console.error("Estado do item fictício", await db.query("SELECT status,version FROM tech_internal_items WHERE id=?", [dated])); await page?.screenshot({ path: path.join(output, "falha.png"), fullPage: true }).catch(() => {}); throw error; }
finally { await writeFile(path.join(output, "resultado-ui.json"), JSON.stringify(results, null, 2)); await browser?.close(); server.kill(); await db.end(); await log.close(); }
