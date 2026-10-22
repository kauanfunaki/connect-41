// Interface real em standalone isolado, banco descartável e sessões fictícias.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import mariadb from "mariadb";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:net";

const url = process.env.TECH_INTERNAL_TEST_DATABASE_URL;
if (!url) throw new Error("Defina TECH_INTERNAL_TEST_DATABASE_URL para o banco descartável.");
const destino = new URL(url);
if (!["127.0.0.1", "localhost"].includes(destino.hostname) || destino.port !== "33379" || destino.pathname !== "/connect41") throw new Error("Banco não isolado recusado.");
await new Promise((resolve, reject) => { const reserva = createServer(); reserva.once("error", () => reject(new Error("A porta 33382 precisa estar livre para o teste."))); reserva.listen(33382, "127.0.0.1", () => reserva.close(resolve)); });
const raiz = process.cwd(), saida = path.join(raiz, ".local", "tech-interno"); await mkdir(saida, { recursive: true });
const { workspace } = JSON.parse(await readFile(path.join(saida, "build-workspace.json"), "utf8"));
if (path.dirname(path.resolve(workspace)) !== saida || !path.basename(workspace).startsWith("build-")) throw new Error("Build fora da cópia isolada recusado.");
const servidorPath = path.join(workspace, ".next", "standalone", "server.js"); await access(servidorPath);
const db = await mariadb.createConnection({ host: destino.hostname, port: 33379, user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", allowPublicKeyRetrieval: true });
const tenantId = randomUUID(), adminId = randomUUID(), techId = randomUUID(), fiscalId = randomUUID(), readId = randomUUID();
const segredo = "tech-interno-ui-local-ficticio-33382", base = "http://127.0.0.1:33382", rota = "/tech/controle-interno";
const sistema = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "COMSPEC", "PATHEXT"].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
const env = { ...sistema, DATABASE_URL: url, NODE_ENV: "production", PORT: "33382", HOSTNAME: "127.0.0.1", NEXT_TELEMETRY_DISABLED: "1", APP_DOMAIN: "", JWT_ACCESS_SECRET: segredo, JWT_REFRESH_SECRET: `${segredo}-refresh` };
const log = await open(path.join(saida, "ui-server.log"), "w");
let servidor, browser, page;
const resultado = { validacoes: [], errosDeNavegador: [] };
const ok = nome => { resultado.validacoes.push(nome); console.log("OK: " + nome); };
try {
  await db.query("INSERT INTO tenants (id,name,slug,updatedAt) VALUES (?,?,?,NOW(3))", [tenantId, "Escritório fictício — Controle interno", `tech-ui-${tenantId}`]);
  for (const [id, name, role, setor] of [[adminId, "Pessoa administradora", "ADMIN", "tech"], [techId, "Pessoa Tech", "SECTOR_USER", "tech"], [fiscalId, "Pessoa fiscal", "SECTOR_USER", "fiscal"], [readId, "Pessoa diretoria", "READONLY", "fiscal"]]) {
    await db.query("INSERT INTO users (id,tenantId,name,email,passwordHash,role,updatedAt) VALUES (?,?,?,?,?,?,NOW(3))", [id, tenantId, name, `${id}@example.test`, "sem-login-real", role]);
    await db.query("INSERT INTO user_sectors (userId,sectorCode) VALUES (?,?)", [id, setor]);
  }
  await db.query("INSERT INTO sectors (id,tenantId,code,label,color,updatedAt) VALUES (?,?,'tech','Tech','#5369cf',NOW(3))", [randomUUID(), tenantId]);
  await db.query("INSERT INTO tenant_modules (id,tenantId,moduleCode,enabled,updatedAt) VALUES (?,?,'tech_controle_interno',true,NOW(3))", [randomUUID(), tenantId]);
  servidor = spawn(process.execPath, [servidorPath], { cwd: path.dirname(servidorPath), env, windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
  let pronto = false;
  for (let i = 0; i < 45; i++) {
    if (servidor.exitCode !== null) throw new Error("Servidor encerrou. Consulte .local/tech-interno/ui-server.log.");
    try { if ((await fetch(`${base}/api/health`)).ok) { pronto = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(pronto, "Servidor local precisa responder HTTP.");
  const instalado = await access(chromium.executablePath()).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(instalado ? {} : { channel: "msedge" }) });
  const contexto = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const cookie = (id, role = "ADMIN", sectors = ["tech"]) => ({ name: "access_token", value: jwt.sign({ sub: id, tenantId, role, sectors, accessibleTenants: [tenantId] }, segredo, { expiresIn: "30m" }), url: base, httpOnly: true, sameSite: "Lax" });
  await contexto.addCookies([cookie(adminId), { name: "theme", value: "light", url: base }]);
  page = await contexto.newPage(); page.on("pageerror", err => resultado.errosDeNavegador.push(err.message));
  const escolher = async (id, nome, pagina = page) => {
    await pagina.locator(`label[for="${id}"]`).locator("..").getByRole("combobox").click();
    await pagina.getByRole("option", { name: nome, exact: true }).click();
  };
  await page.goto(`${base}${rota}/sistemas`);
  await page.getByRole("button", { name: "Cadastrar sistema", exact: true }).click();
  await page.getByLabel("Nome do sistema").fill("Connect de teste");
  await page.getByRole("button", { name: "Salvar sistema", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Connect de teste").first().waitFor(); ok("Cadastro de sistema reutilizável");
  await page.goto(`${base}${rota}/novo`);
  await page.getByLabel("Título").fill("Planejar sistema fictício");
  await escolher("tech-type", "Migração"); await escolher("tech-system", "Novo sistema");
  await page.getByLabel("Descrição").fill("Ideia fictícia registrada somente no teste local.");
  await page.getByRole("button", { name: "Criar item", exact: true }).click();
  await page.waitForURL(/\/tech\/controle-interno\/[a-f0-9-]{36}$/);
  const itemId = new URL(page.url()).pathname.split("/").at(-1);
  const [item] = await db.query("SELECT * FROM tech_internal_items WHERE id=? AND tenantId=?", [itemId, tenantId]);
  assert.equal(item.systemMode, "NEW"); assert.equal(item.toolId, null); assert.equal(item.assigneeId, null); assert.equal(item.dueDate, null); assert.equal(item.priority, 1);
  ok("Item Novo sistema com responsável e prazo vazios, prioridade Média");
  await page.getByLabel("Comentário", { exact: true }).fill("Comentário fictício da equipe.");
  await page.getByRole("button", { name: "Adicionar comentário", exact: true }).click();
  await page.getByText("Comentário fictício da equipe.", { exact: true }).waitFor();
  await escolher("tech-status", "Em validação"); await escolher("tech-assignee", "Pessoa Tech");
  await page.locator("#tech-due").fill("25/10/2026"); await page.locator("#tech-due").press("Tab");
  await page.getByLabel("Título").fill("Validar sistema fictício");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await page.getByRole("heading", { name: "Validar sistema fictício", exact: true }).waitFor();
  await page.getByLabel("Histórico do item").getByText(/Planejar sistema fictício.*→.*Validar sistema fictício/).waitFor();
  ok("Edição, prazo de calendário, responsável, situação e histórico com antes/depois");

  const segunda = await contexto.newPage(); await segunda.goto(`${base}${rota}/${itemId}`);
  await segunda.getByRole("heading", { name: "Validar sistema fictício", exact: true }).waitFor();
  await page.getByLabel("Título").fill("Alteração confirmada"); await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await page.getByRole("heading", { name: "Alteração confirmada", exact: true }).waitFor();
  await segunda.getByLabel("Título").fill("Não pode sobrescrever"); await segunda.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await segunda.getByRole("alert").getByText(/alterado por outra pessoa/).waitFor(); await segunda.close(); ok("Duas abas não sobrescrevem alterações");

  await page.goto(`${base}${rota}/novo`); await page.getByLabel("Título").fill("Corrigir integração fictícia");
  await escolher("tech-type", "Bug"); await escolher("tech-system", "Connect de teste");
  await page.getByRole("button", { name: "Criar item", exact: true }).click(); await page.waitForURL(/\/tech\/controle-interno\/[a-f0-9-]{36}$/);
  const vinculado = new URL(page.url()).pathname.split("/").at(-1);
  await page.goto(`${base}${rota}/sistemas`); await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Sistema ativo", { exact: true }).uncheck(); await page.getByRole("button", { name: "Salvar sistema", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.goto(`${base}${rota}/${vinculado}`); await page.getByRole("combobox", { name: "Sistema", exact: true }).filter({ hasText: "Connect de teste (inativo)" }).waitFor();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[name="version"]')?.value === "1"); ok("Sistema inativo preserva o vínculo existente");
  await page.goto(`${base}${rota}?sistema=NEW&tipo=MIGRATION`); await page.getByRole("link", { name: "Alteração confirmada", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Corrigir integração fictícia", exact: true }).count(), 0); ok("Lista aplica filtros combinados por sistema e tipo");
  await page.goto(`${base}${rota}/novo`);
  await page.locator('label[for="tech-system"]').locator("..").getByRole("combobox").click();
  assert.equal(await page.getByRole("option", { name: "Connect de teste (inativo)", exact: true }).count(), 0);
  await page.keyboard.press("Escape"); ok("Sistema inativo não é oferecido em novos itens");

  const leitura = await browser.newContext(); await leitura.addCookies([cookie(readId, "READONLY", ["fiscal"])]);
  const paginaLeitura = await leitura.newPage(); await paginaLeitura.goto(`${base}${rota}/${itemId}`);
  await paginaLeitura.getByText("Acesso somente para consulta.", { exact: true }).waitFor();
  assert.equal(await paginaLeitura.getByRole("button", { name: "Salvar alterações", exact: true }).count(), 0);
  assert.equal(await paginaLeitura.getByRole("button", { name: "Adicionar comentário", exact: true }).count(), 0);
  await leitura.close(); ok("Diretoria global consulta sem ações de gravação");
  const fiscal = await browser.newContext(); await fiscal.addCookies([cookie(fiscalId, "SECTOR_USER", ["fiscal"])]);
  const negado = await fiscal.request.get(`${base}${rota}/${itemId}`);
  assert.ok(!((await negado.text()).includes("Comentário fictício da equipe."))); assert.ok([200, 404].includes(negado.status()));
  await fiscal.close(); ok("Outro setor não recebe dados internos na rota direta");

  for (const width of [1366, 1093, 911, 683, 390]) {
    await page.setViewportSize({ width, height: 768 }); await page.goto(`${base}${rota}/${itemId}`);
    await page.getByRole("heading", { name: "Alteração confirmada", exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Sem overflow em ${width}px`);
    await page.getByRole("button", { name: "Salvar alterações", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(saida, `detalhe-${width}.png`), fullPage: true, animations: "disabled" });
    await page.goto(`${base}${rota}`); await page.getByRole("heading", { name: "Controle interno", exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Lista sem overflow em ${width}px`);
    await page.screenshot({ path: path.join(saida, `lista-${width}.png`), fullPage: true, animations: "disabled" });
  }
  ok("Lista e detalhe em 1366, 1093, 911, 683 e 390 px; áreas equivalentes a 100%, 125%, 150% e 200%");
  await page.setViewportSize({ width: 1366, height: 768 }); await contexto.addCookies([{ name: "theme", value: "dark", url: base }]); await page.reload();
  await page.getByRole("heading", { name: "Controle interno", exact: true }).waitFor(); await page.screenshot({ path: path.join(saida, "lista-dark.png"), fullPage: true, animations: "disabled" });
  assert.deepEqual(resultado.errosDeNavegador, []); ok("Tema escuro e ausência de erros JavaScript");
} catch (err) {
  await page?.screenshot({ path: path.join(saida, "falha-ui.png"), fullPage: true }).catch(() => {});
  throw err;
} finally {
  await writeFile(path.join(saida, "resultado-ui.json"), JSON.stringify(resultado, null, 2));
  await browser?.close(); servidor?.kill();
  for (const tabela of ["tech_internal_comments", "tech_internal_changes", "tech_internal_items", "tech_internal_tools", "tenant_modules", "sectors"]) await db.query(`DELETE FROM \`${tabela}\` WHERE tenantId=?`, [tenantId]);
  await db.query("DELETE FROM users WHERE tenantId=?", [tenantId]); await db.query("DELETE FROM tenants WHERE id=?", [tenantId]);
  await db.end(); await log.close();
}
