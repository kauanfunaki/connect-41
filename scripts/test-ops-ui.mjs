// Navegador real, sessões fictícias e banco local descartável.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import mariadb from "mariadb";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:net";

const url = process.env.OPS_TEST_DATABASE_URL;
if (!url) throw new Error("Defina OPS_TEST_DATABASE_URL para o banco descartável.");
const destino = new URL(url);
if (!["127.0.0.1", "localhost"].includes(destino.hostname) || destino.port !== "33379" || destino.pathname !== "/connect41") throw new Error("Banco não isolado recusado.");
await new Promise((resolve, reject) => { const reserva = createServer(); reserva.once("error", () => reject(new Error("A porta 33381 precisa estar livre para o teste."))); reserva.listen(33381, "127.0.0.1", () => reserva.close(resolve)); });
const raiz = process.cwd(), saida = path.join(raiz, ".local", "ops"); await mkdir(saida, { recursive: true });
const { workspace } = JSON.parse(await readFile(path.join(saida, "build-workspace.json"), "utf8"));
const servidorPath = path.join(workspace, ".next", "standalone", "server.js");
await access(servidorPath);
const db = await mariadb.createConnection({ host: destino.hostname, port: 33379, user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", allowPublicKeyRetrieval: true });
const tenantId = randomUUID(), userId = randomUUID(), colegaId = randomUUID(), fiscalId = randomUUID();
await db.query("INSERT INTO tenants (id,name,slug,updatedAt) VALUES (?,?,?,NOW(3))", [tenantId, "Escritório fictício — Ops Center", `ops-ui-${tenantId}`]);
for (const [id, name, role, setor] of [[userId, "Pessoa de teste A", "ADMIN", "tech"], [colegaId, "Pessoa de teste B", "ADMIN", "tech"], [fiscalId, "Pessoa fiscal", "SECTOR_USER", "fiscal"]]) {
  await db.query("INSERT INTO users (id,tenantId,name,email,passwordHash,role,updatedAt) VALUES (?,?,?,?,?,?,NOW(3))", [id, tenantId, name, `${id}@example.test`, "sem-login-real", role]);
  await db.query("INSERT INTO user_sectors (userId,sectorCode) VALUES (?,?)", [id, setor]);
}
await db.query("INSERT INTO sectors (id,tenantId,code,label,color,updatedAt) VALUES (?,?,'tech','Tech','#5369cf',NOW(3))", [randomUUID(), tenantId]);
await db.query("INSERT INTO tenant_modules (id,tenantId,moduleCode,enabled,updatedAt) VALUES (?,?,'tech_ops_center',true,NOW(3))", [randomUUID(), tenantId]);
const segredo = "ops-ui-somente-teste-local-33381";
const sistema = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "COMSPEC", "PATHEXT"].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
const env = { ...sistema, DATABASE_URL: url, NODE_ENV: "production", PORT: "33381", HOSTNAME: "127.0.0.1", NEXT_TELEMETRY_DISABLED: "1", APP_DOMAIN: "", JWT_ACCESS_SECRET: segredo, JWT_REFRESH_SECRET: `${segredo}-refresh` };
const log = await open(path.join(saida, "ui-server.log"), "w");
const servidor = spawn(process.execPath, [servidorPath], { cwd: path.dirname(servidorPath), env, windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
const base = "http://127.0.0.1:33381";
let browser, page;
const resultado = { validacoes: [], errosDeNavegador: [] };
const ok = nome => { resultado.validacoes.push(nome); console.log("OK: " + nome); };
try {
  let pronto = false;
  for (let i = 0; i < 60; i++) {
    if (servidor.exitCode !== null) throw new Error("Servidor encerrou; consulte .local/ops/ui-server.log.");
    try { if ((await fetch(`${base}/api/health`)).ok) { pronto = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(pronto, "Servidor local precisa responder HTTP.");
  const instalado = await access(chromium.executablePath()).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(instalado ? {} : { channel: "msedge" }) });
  const contexto = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const cookie = (id, role = "ADMIN", sectors = ["tech"]) => ({ name: "access_token", value: jwt.sign({ sub: id, tenantId, role, sectors, accessibleTenants: [tenantId] }, segredo, { expiresIn: "30m" }), url: base, httpOnly: true, sameSite: "Lax" });
  await contexto.addCookies([cookie(userId)]);
  page = await contexto.newPage(); page.setDefaultTimeout(30000);
  page.on("pageerror", e => resultado.errosDeNavegador.push(e.message));
  const chamada = async (route, method, body) => {
    const r = await contexto.request.fetch(base + route, { method, data: body });
    assert.ok(r.ok(), `${method} ${route}: ${r.status()} ${await r.text()}`); return r.json();
  };
  for (const [slug, name, ownerId] of [["bot_fiscal", "Conversão fiscal", userId], ["bot_documentos", "Organização de documentos", colegaId]]) {
    await chamada("/api/ops/watchers", "POST", { slug, name, ownerId, description: "Automação fictícia para conferência do painel.", client: "Empresa de teste", folderInput: "N:\\EXEMPLO\\ENTRADA", folderOutput: "N:\\EXEMPLO\\SAIDA" });
  }
  await chamada("/api/ops/watchers", "POST", { slug: "bot_pausado", name: "Rotina desativada", ownerId: colegaId, isActive: false });
  await page.goto(`${base}/admin/integracoes?integracao=ops_center`);
  await page.getByRole("heading", { name: "Ops Center — bots", exact: true }).waitFor();
  await page.getByRole("button", { name: "Gerar chave", exact: true }).click();
  const chave = await page.locator("#ops-shared-token").inputValue();
  assert.match(chave, /^ops_[a-f0-9]{64}$/); ok("Integrações gera uma única chave compartilhada para o escritório");
  const envio = { watcherSlug: "bot_fiscal", eventId: "ui-erro-1", filename: "exemplo.xml", status: "ERROR", errorMessage: "Falha fictícia de processamento." };
  for (let i = 0; i < 2; i++) {
    const r = await fetch(`${base}/api/ops/events`, { method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" }, body: JSON.stringify(envio) });
    assert.equal(r.status, 200); assert.equal((await r.json()).duplicate, i === 1);
  }
  const avisos = await db.query("SELECT COUNT(*) AS n FROM notifications WHERE tenantId=? AND userId=? AND type='OPS_AUTOMACAO_ERRO'", [tenantId, userId]);
  assert.equal(Number(avisos[0].n), 1); ok("Erro recebido pela API gera aviso único ao dono");
  const mesmoTokenOutroBot = await fetch(`${base}/api/ops/events`, { method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...envio, watcherSlug: "bot_documentos", eventId: "ui-sucesso-2", status: "SUCCESS" }) });
  assert.equal(mesmoTokenOutroBot.status, 200); ok("A mesma chave atende outra automação pelo slug informado");
  assert.equal((await fetch(`${base}/api/ops/events`, { method: "POST", headers: { "Content-Type": "application/json", "x-user-role": "ADMIN", "x-tenant-id": tenantId }, body: JSON.stringify(envio) })).status, 401); ok("Ingestão exige chave de integração");
  assert.equal((await fetch(`${base}/api/ops/watchers/bot_fiscal/heartbeat`, { method: "POST", headers: { Authorization: `Bearer ${chave}` } })).status, 200);

  await page.goto(`${base}/ops`); await page.getByRole("heading", { name: "Ops Center", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Integração", exact: true }).count(), 0); await page.getByRole("link", { name: "Integração dos bots", exact: true }).waitFor(); ok("Credencial centralizada no menu, sem ação de integração por automação");
  await page.getByRole("heading", { name: "Organização de documentos", exact: true }).waitFor();
  const automacoes = page.locator('section[aria-labelledby="ops-automacoes"]');
  const documentos = automacoes.getByRole("article").filter({ has: page.getByRole("heading", { name: "Organização de documentos", exact: true }) });
  await documentos.getByText("Offline", { exact: true }).waitFor();
  await automacoes.getByRole("article").filter({ has: page.getByRole("heading", { name: "Rotina desativada", exact: true }) }).getByText("Offline", { exact: true }).waitFor();
  ok("Sem sinal e recebimento desativado aparecem como Offline");
  const busca = page.getByRole("searchbox", { name: "Buscar automação", exact: true });
  await busca.fill("documentos"); assert.equal(await automacoes.getByRole("article").count(), 1);
  await busca.fill("Pessoa de teste A"); await page.getByRole("heading", { name: "Conversão fiscal", exact: true }).waitFor();
  assert.equal(await automacoes.getByRole("article").count(), 1);
  await busca.fill("automação inexistente"); await page.getByText("Nenhuma automação encontrada", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Limpar busca e status", exact: true }).click();
  const filtro = page.getByRole("group", { name: "Filtrar automações por status", exact: true });
  await filtro.getByRole("button", { name: "Online", exact: true }).click(); assert.equal(await automacoes.getByRole("article").count(), 1);
  await filtro.getByRole("button", { name: "Offline", exact: true }).click(); assert.equal(await automacoes.getByRole("article").count(), 2);
  await filtro.getByRole("button", { name: "Todos", exact: true }).click(); ok("Busca por nome/responsável, estado vazio e filtros Online/Offline");
  const visoes = page.getByRole("group", { name: "Visualizações do Ops Center", exact: true });
  await visoes.getByRole("button", { name: /^Histórico/ }).click(); await page.getByRole("heading", { name: "Histórico de processamento", exact: true }).waitFor();
  await visoes.getByRole("button", { name: "Automações", exact: true }).click(); await page.getByRole("heading", { name: "Conversão fiscal", exact: true }).waitFor(); ok("Visualizações alternam entre cartões e histórico");
  await page.getByRole("button", { name: "Minhas automações", exact: true }).click();
  await page.getByRole("heading", { name: "Organização de documentos", exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Conversão fiscal", exact: true }).waitFor(); ok("Minhas automações filtra o painel");
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await page.getByRole("heading", { name: "Organização de documentos", exact: true }).waitFor();
  await page.screenshot({ path: path.join(saida, "ops-desktop.png"), fullPage: true, animations: "disabled" });

  const cartao = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Conversão fiscal", exact: true }) });
  await cartao.getByRole("button", { name: "Sinalizar instabilidade", exact: true }).click();
  await page.getByRole("dialog").getByLabel("O que aconteceu?", { exact: true }).fill("Instabilidade fictícia, registrada apenas para teste.");
  await page.getByRole("dialog").getByRole("button", { name: "Sinalizar instabilidade", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await cartao.getByRole("button", { name: "Revisar instabilidade", exact: true }).waitFor();
  await filtro.getByRole("button", { name: "Instável", exact: true }).click();
  await cartao.getByText("Instável", { exact: true }).waitFor(); assert.equal(await automacoes.getByRole("article").count(), 1);
  await filtro.getByRole("button", { name: "Todos", exact: true }).click(); ok("Sinalização com comunicação recente aparece no filtro Instável");
  await cartao.getByRole("button", { name: "Revisar instabilidade", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Marcar como resolvida", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await cartao.getByRole("button", { name: "Sinalizar instabilidade", exact: true }).waitFor(); ok("Instabilidade pode ser sinalizada e resolvida na interface");
  await cartao.getByRole("button", { name: "Editar Conversão fiscal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Dono da automação", { exact: true }).locator("..").getByRole("combobox").click();
  await page.getByRole("option", { name: "Pessoa de teste B", exact: true }).click();
  const [salvo] = await Promise.all([page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes("/api/ops/watchers/")), dialog.getByRole("button", { name: "Salvar automação", exact: true }).click()]);
  assert.ok(salvo.ok(), `Salvar responsável: ${salvo.status()} ${await salvo.text()}`);
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Minhas automações", exact: true }).click();
  await page.getByText("Nenhuma automação atribuída a você", { exact: true }).waitFor(); ok("Edição do dono altera o filtro Minhas");
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await page.getByRole("heading", { name: "Conversão fiscal", exact: true }).waitFor();
  await page.goto(`${base}/ops?watcher=bot_fiscal&status=ERROR`); await page.getByRole("table").getByRole("button", { name: "Ver detalhes", exact: true }).click();
  assert.equal(await page.getByRole("dialog").locator("textarea").inputValue(), "Falha fictícia de processamento.");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click(); ok("Link do aviso abre os erros e seus detalhes");
  await page.getByRole("table").scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(saida, "ops-historico.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "Ops Center", exact: true }).scrollIntoViewIfNeeded();
  if (await page.getByRole("button", { name: "Abrir menu", exact: true }).getAttribute("aria-expanded") === "true") await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
  await page.screenshot({ path: path.join(saida, "ops-mobile.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Conversão fiscal", exact: true }) }).getByRole("button", { name: "Ver detalhes", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click(); ok("Histórico mobile abre detalhes sem depender da tabela");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); ok("Layout em tela de 390 px sem vazamento lateral");
  await page.getByRole("group", { name: "Visualizações do Ops Center", exact: true }).getByRole("button", { name: "Automações", exact: true }).click();
  await page.screenshot({ path: path.join(saida, "ops-automacoes-mobile.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 320, height: 768 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); ok("Cartões em 320 px sem vazamento lateral");
  await page.setViewportSize({ width: 683, height: 384 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); ok("Área útil equivalente a 200% em 1366 px");
  await page.setViewportSize({ width: 1366, height: 768 }); await contexto.addCookies([{ name: "theme", value: "dark", url: base }]);
  await page.reload(); await page.getByRole("heading", { name: "Conversão fiscal", exact: true }).waitFor(); ok("Visualização escolhida permanece após recarregar");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator('span[aria-hidden][class*="statusDot"]').first().evaluate(el => getComputedStyle(el).animationName), "none"); ok("Indicador de atividade respeita movimento reduzido");
  await page.screenshot({ path: path.join(saida, "ops-dark.png"), fullPage: true, animations: "disabled" });

  const fiscalContext = await browser.newContext(); await fiscalContext.addCookies([cookie(fiscalId, "SECTOR_USER", ["fiscal"])]);
  const negado = await fiscalContext.request.get(`${base}/api/ops`); assert.equal(negado.status(), 403);
  await fiscalContext.close(); ok("Usuário de outro setor não consulta o Ops Center");
  assert.deepEqual(resultado.errosDeNavegador, []); ok("Sem erros de navegador");
} catch (err) {
  if (page) { await page.screenshot({ path: path.join(saida, "ops-falha.png"), fullPage: true }).catch(() => {}); console.error(await page.getByRole("dialog").innerText().catch(() => "Sem diálogo aberto")); }
  throw err;
} finally {
  await writeFile(path.join(saida, "resultado-ui.json"), JSON.stringify(resultado, null, 2));
  await browser?.close(); servidor.kill(); await db.end(); await log.close();
}
