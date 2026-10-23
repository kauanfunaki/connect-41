// Smoke test com navegador real, banco descartável e sessão assinada só com
// segredos fictícios. Nunca usa DATABASE_URL nem credenciais de .env.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import mariadb from "mariadb";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createConnection, createServer } from "node:net";
import { prepararWorkspaceDeTeste } from "./helpdesk-test-workspace.mjs";

const url = process.env.HELPDESK_TEST_DATABASE_URL;
if (!url) throw new Error("Defina HELPDESK_TEST_DATABASE_URL para o banco descartável.");
const destino = new URL(url);
if (!["127.0.0.1", "localhost"].includes(destino.hostname) || destino.port !== "33379" || destino.pathname !== "/connect41") throw new Error("O teste exige localhost:33379/connect41.");
const raiz = process.cwd(), saida = path.join(raiz, ".local", "helpdesk"); await mkdir(saida, { recursive: true });
await new Promise((resolve, reject) => { const reserva = createServer(); reserva.once("error", () => reject(new Error("A porta 33380 precisa estar livre para o teste."))); reserva.listen(33380, "127.0.0.1", () => reserva.close(resolve)); });
const workspace = await prepararWorkspaceDeTeste(raiz, "interface");
const db = await mariadb.createConnection({ host: destino.hostname, port: Number(destino.port), user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", allowPublicKeyRetrieval: true });
const tenantId = randomUUID(), userId = randomUUID(), categoryId = randomUUID();
await db.query("INSERT INTO tenants (id,name,slug,updatedAt) VALUES (?,?,?,NOW(3))", [tenantId, "Escritório fictício — teste de interface", `helpdesk-ui-${tenantId}`]);
await db.query("INSERT INTO users (id,tenantId,name,email,passwordHash,role,updatedAt) VALUES (?,?,?,?,?,'ADMIN',NOW(3))", [userId, tenantId, "Pessoa de teste", `ui-${userId}@example.test`, "sem-login-externo"]);
for (const [code, label] of [["tech", "Tecnologia"], ["fiscal", "Fiscal"]]) await db.query("INSERT INTO sectors (id,tenantId,code,label,updatedAt) VALUES (?,?,?,?,NOW(3))", [randomUUID(), tenantId, code, label]);
await db.query("INSERT INTO user_sectors (userId,sectorCode) VALUES (?,?)", [userId, "tech"]);
await db.query("INSERT INTO tenant_modules (id,tenantId,moduleCode,enabled,sectorCode,updatedAt) VALUES (?,?,'helpdesk',true,'tech',NOW(3))", [randomUUID(), tenantId]);
await db.query("INSERT INTO helpdesk_requester_sectors (tenantId,sectorCode) VALUES (?,'fiscal')", [tenantId]);
await db.query("INSERT INTO helpdesk_categories (id,tenantId,name,descriptionTemplate,formSchema,requiredAttachments,checklistTemplate,approvalUserIds,updatedAt) VALUES (?,?,?,'','[]','[]',?,'[]',NOW(3))", [categoryId, tenantId, "Acesso fictício", JSON.stringify([{ key: "conferir", label: "Conferir acesso" }])]);
await db.query("INSERT INTO helpdesk_categories (id,tenantId,name,descriptionTemplate,formSchema,requiredAttachments,checklistTemplate,approvalUserIds,updatedAt) VALUES (?,?,?,'','[]','[]',?,'[]',NOW(3))", [randomUUID(), tenantId, "A classificar", JSON.stringify([{ key: "conferir", label: "Conferir acesso" }])]);

const segredo = "helpdesk-ui-chave-ficticia-apenas-local-33380";
const sistema = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "ProgramFiles", "ProgramFiles(x86)", "USERPROFILE", "COMSPEC", "PATHEXT", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
const env = { ...sistema, DATABASE_URL: url, NODE_ENV: "production", PORT: "33380", HOSTNAME: "127.0.0.1", NEXT_TELEMETRY_DISABLED: "1", APP_DOMAIN: "", JWT_ACCESS_SECRET: segredo, JWT_REFRESH_SECRET: `${segredo}-refresh`, SECRETS_ENCRYPTION_KEY: `${segredo}-cifra` };
const log = await open(path.join(saida, "next-ui.log"), "w");
const servidor = spawn(process.execPath, [path.join(workspace, "server.js")], { cwd: workspace, env, windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
const base = "http://127.0.0.1:33380";
let browser, page;
try {
  console.log("Iniciando servidor local de interface com banco isolado…");
  let pronto = false;
  for (let i = 0; i < 90; i++) {
    if (servidor.exitCode !== null) throw new Error("O servidor de teste encerrou. Veja .local/helpdesk/next-ui.log.");
    try { await new Promise((resolve, reject) => { const socket = createConnection({ host: "127.0.0.1", port: 33380 }); socket.setTimeout(1000); socket.once("connect", () => { socket.destroy(); resolve(); }); socket.once("error", reject); socket.once("timeout", () => { socket.destroy(); reject(new Error("timeout")); }); }); pronto = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!pronto) throw new Error("O servidor de teste não ficou pronto.");
  const instalado = await access(chromium.executablePath()).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(instalado ? {} : { channel: "msedge" }) });
  const contexto = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await contexto.addCookies([{ name: "access_token", value: jwt.sign({ sub: userId, tenantId, role: "ADMIN", sectors: ["tech"], accessibleTenants: [tenantId] }, segredo, { expiresIn: "30m" }), url: base, httpOnly: true, sameSite: "Lax" }]);
  page = await contexto.newPage(); const erros = []; page.on("pageerror", e => erros.push(e.message));
  page.setDefaultTimeout(30000);
  await page.goto(`${base}/chamados`, { timeout: 120000 }); await page.getByRole("heading", { name: "Chamados", exact: true }).waitFor();
  await page.getByRole("link", { name: "Novo chamado", exact: true }).click();
  await page.getByRole("heading", { name: "Novo chamado", exact: true }).waitFor();
  const abertura = page.locator("form").filter({ has: page.getByRole("heading", { name: "Detalhes do chamado", exact: true }) });
  const escolher = async (indice, rotulo) => { await abertura.getByRole("combobox").nth(indice).click(); await page.getByRole("option", { name: rotulo, exact: true }).click(); };
  assert.equal(await page.getByRole("heading", { name: "Selecione a categoria do chamado", exact: true }).count(), 0);
  await escolher(0, "Fiscal");
  await page.getByLabel("Título", { exact: true }).fill("Acesso fictício ao sistema de atendimento");
  await page.getByLabel("Descrição", { exact: true }).fill("Preciso de acesso ao ambiente fictício para registrar os atendimentos da equipe de testes.");
  await page.getByLabel("Tags (separadas por vírgula)").fill("sistema, acesso");
  await page.getByLabel("Adicionar arquivo").setInputFiles({ name: "evidencia-ficticia.txt", mimeType: "text/plain", buffer: Buffer.from("Evidência fictícia do teste de interface.") });
  await page.getByRole("link", { name: "evidencia-ficticia.txt" }).waitFor();
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click(); await page.getByText("Rascunho salvo.", { exact: false }).waitFor();
  await page.screenshot({ path: path.join(saida, "novo-1366.png"), fullPage: true });
  console.log("Abertura e upload verificados. Conferindo envio opcional…");
  await page.getByRole("button", { name: "Enviar chamado", exact: true }).click(); await page.getByRole("button", { name: "Enviar sem análise", exact: true }).waitFor();
  await page.getByRole("button", { name: "Enviar sem análise", exact: true }).click(); await page.waitForURL(u => /^\/chamados\/[a-f0-9-]{36}$/.test(u.pathname));
  await page.getByRole("heading", { name: "Atendimento", exact: true }).waitFor();
  const ticketId = new URL(page.url()).pathname.split("/").at(-1);
  await page.getByLabel("Grupo e categoria", { exact: true }).filter({ hasText: "A classificar" }).waitFor();
  const [grupo] = await db.query("SELECT id FROM helpdesk_categories WHERE tenantId=? AND name='Infraestrutura'", [tenantId]);
  await db.query("UPDATE helpdesk_categories SET parentId=? WHERE id=?", [grupo.id, categoryId]);
  await page.getByRole("button", { name: "Editar dados", exact: true }).click();
  await page.getByRole("button", { name: "Acesso fictício", exact: true }).click();
  await page.getByRole("button", { name: "Salvar dados", exact: true }).click();
  await page.getByLabel("Grupo e categoria", { exact: true }).filter({ hasText: "Infraestrutura › Acesso fictício" }).waitFor();
  await page.goto(`${base}/chamados`);
  await page.getByLabel("Grupo e categoria", { exact: true }).filter({ hasText: "Infraestrutura › Acesso fictício" }).waitFor();
  await page.goto(`${base}/chamados/${ticketId}`);
  const situacao = page.locator("form").filter({ has: page.getByRole("heading", { name: "Situação", exact: true }) });
  await situacao.getByRole("combobox").click(); await page.getByRole("option", { name: "Em andamento", exact: true }).click(); await situacao.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByText("Ciclo de SLA 1", { exact: true }).waitFor();
  await page.getByLabel("Somente a equipe", { exact: true }).check(); await page.getByLabel("Nota interna", { exact: true }).fill("Conferência interna fictícia, sem integração externa.");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click(); await page.getByText("Conferência interna fictícia, sem integração externa.", { exact: true }).waitFor();
  const salvouChecklist = page.waitForResponse(r => r.request().method() === "POST" && r.url().includes(`/chamados/${ticketId}`));
  await page.getByLabel("Conferir acesso", { exact: true }).check(); await salvouChecklist;
  const [item] = await db.query("SELECT done FROM helpdesk_checklist_items WHERE ticketId=?", [ticketId]); assert.equal(!!item.done, true);
  await page.getByText("Salvando alteração…", { exact: true }).waitFor({ state: "hidden" }); await page.waitForLoadState("networkidle"); await page.screenshot({ path: path.join(saida, "detalhe-1366.png"), fullPage: true });
  const [ticket] = await db.query("SELECT tags FROM helpdesk_tickets WHERE id=?", [ticketId]); assert.deepEqual(typeof ticket.tags === "string" ? JSON.parse(ticket.tags) : ticket.tags, ["sistema", "acesso"]);
  console.log("Atendimento, SLA, nota interna e checklist verificados. Conferindo responsividade…");
  await page.goto(`${base}/chamados/configuracoes`); await page.getByRole("heading", { name: "Configurar chamados", exact: true }).waitFor();
  await page.getByLabel("Nome da categoria", { exact: true }).fill("Categoria configurada pelo navegador");
  await page.getByRole("button", { name: "Adicionar campo", exact: true }).click(); await page.getByLabel("Rótulo do campo", { exact: true }).fill("Sistema afetado");
  await page.getByLabel("Preenchimento obrigatório", { exact: true }).check();
  await page.getByRole("button", { name: "Adicionar evidência", exact: true }).click(); await page.getByLabel("Nome da evidência", { exact: true }).fill("Evidência da configuração");
  await page.getByLabel("Texto", { exact: true }).check();
  await page.getByRole("button", { name: "Adicionar item", exact: true }).click(); await page.getByLabel("Item 1 do checklist", { exact: true }).fill("Conferir informações");
  const salvouCategoria = page.waitForResponse(r => r.request().method() === "POST" && r.url().includes("/chamados/configuracoes"));
  await page.getByRole("button", { name: "Criar categoria", exact: true }).click(); await salvouCategoria;
  const [configurada] = await db.query("SELECT formSchema,requiredAttachments,checklistTemplate FROM helpdesk_categories WHERE tenantId=? AND name=?", [tenantId, "Categoria configurada pelo navegador"]);
  const json = v => typeof v === "string" ? JSON.parse(v) : v;
  assert.equal(json(configurada.formSchema)[0].required, true); assert.equal(json(configurada.requiredAttachments)[0].mime[0], "text/plain"); assert.equal(json(configurada.checklistTemplate)[0].label, "Conferir informações");
  await page.getByLabel("Chave da Groq", { exact: true }).fill("gsk-chave-apenas-ficticia");
  await page.getByRole("button", { name: "Salvar IA alternativa", exact: true }).click(); await page.getByText("IA alternativa salva.", { exact: true }).waitFor();
  const [alternativa] = await db.query("SELECT configEnc,enabled FROM tenant_integrations WHERE tenantId=? AND integrationCode='helpdesk_groq'", [tenantId]);
  assert.equal(alternativa.configEnc.includes("gsk-chave-apenas-ficticia"), false); assert.equal(!!alternativa.enabled, false);
  await page.reload(); assert.equal(await page.getByLabel("Chave da Groq", { exact: true }).inputValue(), "");
  await page.getByRole("button", { name: "Salvar IA alternativa", exact: true }).click(); await page.getByText("IA alternativa salva.", { exact: true }).waitFor();
  const [preservada] = await db.query("SELECT configEnc FROM tenant_integrations WHERE tenantId=? AND integrationCode='helpdesk_groq'", [tenantId]); assert.equal(preservada.configEnc, alternativa.configEnc);
  await page.goto(`${base}/admin/modulos/helpdesk`); await page.getByRole("heading", { name: "Setores solicitantes dos chamados", exact: true }).waitFor();
  await page.getByLabel("Tecnologia", { exact: true }).check(); await page.getByRole("button", { name: "Salvar setores", exact: true }).click(); await page.getByText("Setores salvos.", { exact: true }).waitFor();
  assert.deepEqual((await db.query("SELECT sectorCode FROM helpdesk_requester_sectors WHERE tenantId=? ORDER BY sectorCode", [tenantId])).map(r => r.sectorCode), ["fiscal", "tech"]);
  console.log("Categorias, formulários, setores e configuração protegida da IA alternativa verificados.");
  for (const [nome, width, height] of [["100", 1366, 768], ["125", 1092, 614], ["150", 910, 512], ["200", 683, 384], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height }); await page.goto(`${base}/chamados/configuracoes`); await page.getByRole("heading", { name: "Configurar chamados", exact: true }).waitFor();
    await page.waitForLoadState("networkidle");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `Configuração com rolagem horizontal em ${nome}%`);
    await page.keyboard.press("Tab"); assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");
    await page.screenshot({ path: path.join(saida, `configuracao-${nome}.png`), fullPage: true });
    await page.goto(`${base}/chamados/${ticketId}`); await page.getByRole("heading", { name: "Atendimento", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `Detalhe com rolagem horizontal em ${nome}%`);
    await page.goto(`${base}/chamados/novo`); await page.getByRole("heading", { name: "Detalhes do chamado", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Selecione a categoria do chamado", exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `Novo chamado com rolagem horizontal em ${nome}%`);
  }
  assert.deepEqual(erros, []);
  console.log("Interface verificada em 1366×768, áreas úteis de 125%, 150%, 200% e celular. Capturas: .local/helpdesk.");
} catch (erro) {
  if (page) { await page.screenshot({ path: path.join(saida, "erro-ui.png"), fullPage: true, timeout: 3000 }).catch(() => {}); await writeFile(path.join(saida, "erro-ui.txt"), await page.locator("body").innerText({ timeout: 3000 }).catch(() => "")).catch(() => {}); }
  console.error(await readFile(path.join(saida, "next-ui.log"), "utf8").then(t => t.slice(-5000), () => "")); throw erro;
} finally {
  await browser?.close(); await db.end();
  if (servidor.pid && servidor.exitCode === null) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(servidor.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); else servidor.kill("SIGTERM");
  }
  await log.close();
}
