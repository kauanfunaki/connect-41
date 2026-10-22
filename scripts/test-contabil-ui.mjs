import { spawn, spawnSync } from "node:child_process";
import { randomUUID, createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, writeFile, open, access } from "node:fs/promises";
import path from "node:path";
import mariadb from "mariadb";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";
import assert from "node:assert/strict";

const url = process.env.CONTABIL_TEST_DATABASE_URL;
if (!url) throw new Error("Defina CONTABIL_TEST_DATABASE_URL para o banco descartável 127.0.0.1:33382/connect41.");
const destino = new URL(url);
if (destino.hostname !== "127.0.0.1" || destino.port !== "33382" || destino.pathname !== "/connect41") throw new Error("Banco não isolado recusado.");
const raiz = process.cwd(), saida = path.join(raiz, ".local", "contabil");
await mkdir(path.join(saida, "evidencias"), { recursive: true });
const { workspace } = JSON.parse(await readFile(path.join(saida, "build-workspace.json"), "utf8"));
if (path.dirname(workspace) !== saida) throw new Error("Build fora da cópia isolada.");
const sped = process.env.CONTABIL_TEST_SPED_ROOT ?? path.resolve(raiz, "..", "CLONED", "sped_generator");
const python = path.join(sped, ".venv-ci", "Scripts", "python.exe");
await access(python);
const sistema = Object.fromEntries(["PATH","Path","SystemRoot","WINDIR","TEMP","TMP","LOCALAPPDATA","APPDATA","USERPROFILE","COMSPEC","PATHEXT"].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
const segredo = "contabil-ui-jwt-ficticio", cifra = "contabil-ui-crypto-ficticio";
const tenantId = randomUUID(), adminId = randomUUID(), contabilId = randomUUID(), fiscalId = randomUUID();
const base = "http://127.0.0.1:33385";
const env = { ...sistema, DATABASE_URL: url, PORT: "33385", HOSTNAME: "127.0.0.1", NODE_ENV: "production", APP_DOMAIN: "", JWT_ACCESS_SECRET: segredo, JWT_REFRESH_SECRET: segredo + "-refresh", SECRETS_ENCRYPTION_KEY: cifra, NEXT_TELEMETRY_DISABLED: "1" };
const pyenv = { ...sistema, DB_HOST: "127.0.0.1", DB_PORT: "33382", DB_NAME: "sped_ci", DB_USER: "sped_ci", DB_PASSWORD: process.env.CONTABIL_TEST_SPED_PASSWORD ?? "contabil-ci-only", PYTHONDONTWRITEBYTECODE: "1", PYTHONUTF8: "1", CONNECT_TOKEN_SERVICO: "contabil-read-fixture", CONNECT_CONTABIL_TOKEN_ESCRITA: "contabil-write-fixture", CONNECT_CONTABIL_TENANT_ID: tenantId, CONNECT_CONTABIL_CNPJ_RAIZ: "17122471" };
function executarNode(args) {
  const r = spawnSync(process.execPath, args, { cwd: raiz, env: { ...env, DOTENV_CONFIG_PATH: path.join(saida, "sem-env") }, encoding: "utf8", windowsHide: true, maxBuffer: 40 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout;
}
function cifrar(dados) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", scryptSync(cifra, "connect41-tenant-secrets", 32), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(dados), "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), bytes.toString("hex")].join(":");
}
const db = await mariadb.createConnection({ host: destino.hostname, port: 33382, user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), multipleStatements: true, allowPublicKeyRetrieval: true });
const log = await open(path.join(saida, "ui-server.log"), "w");
const pylog = await open(path.join(saida, "ui-sped-server.log"), "w");
let servidor, spedServer, browser;
const resultado = { sucesso: false, validacoes: [], errosDeNavegador: [] };
const ok = s => { resultado.validacoes.push(s); console.log("OK: " + s); };
try {
  await db.query("CREATE DATABASE IF NOT EXISTS connect41");
  await db.query("USE connect41");
  if (!(await db.query("SHOW TABLES")).length) {
    const config = path.join(saida, "prisma-test.config.ts");
    await writeFile(config, 'import { defineConfig } from "prisma/config"; export default defineConfig({ schema: "../../prisma/schema.prisma", datasource: { url: process.env.DATABASE_URL } });');
    const sql = executarNode(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script", "--config", config]);
    await db.query(sql);
  }
  await db.query("INSERT INTO tenants (id,name,slug,updatedAt) VALUES (?,?,?,NOW(3))", [tenantId,"Escritório fictício — Contábil","contabil-ui-" + tenantId]);
  for (const [id, nome, role, setor] of [[adminId,"Pessoa administradora","ADMIN","contabil"],[contabilId,"Pessoa contábil","SECTOR_USER","contabil"],[fiscalId,"Pessoa fiscal","SECTOR_USER","fiscal"]]) {
    await db.query("INSERT INTO users (id,tenantId,name,email,passwordHash,role,updatedAt) VALUES (?,?,?,?,?,?,NOW(3))", [id,tenantId,nome,id + "@example.test","sem-login-real",role]);
    await db.query("INSERT INTO user_sectors (userId,sectorCode) VALUES (?,?)", [id,setor]);
  }
  for (const [code,label,color] of [["contabil","Contábil","#4F46E5"],["fiscal","Fiscal","#C5374B"]]) await db.query("INSERT INTO sectors (id,tenantId,code,label,color,updatedAt) VALUES (?,?,?,?,?,NOW(3))",[randomUUID(),tenantId,code,label,color]);
  await db.query("INSERT INTO companies (id,tenantId,name,cnpj,updatedAt) VALUES (?,?,?, ?,NOW(3))", [randomUUID(),tenantId,"Empresa fictícia de transporte","17122471000175"]);
  await db.query("INSERT INTO sped_sync_roots (tenantId,cnpjRaiz) VALUES (?,?)", [tenantId,"17122471"]);
  await db.query("INSERT INTO tenant_integrations (id,tenantId,integrationCode,instanceKey,enabled,configEnc,updatedAt) VALUES (?,?,'sped','default',true,?,NOW(3))", [randomUUID(),tenantId,cifrar({ baseUrl: "http://127.0.0.1:33384", serviceToken: pyenv.CONNECT_TOKEN_SERVICO, accountingWriteToken: pyenv.CONNECT_CONTABIL_TOKEN_ESCRITA })]);
  await db.query("DELETE FROM sped_ci.depara_contabil WHERE cnpj_fornecedor='99999999000199'");
  const serverPy = path.join(saida, "sped-ui-server.py"), workerPy = path.join(saida, "sped-ui-worker.py");
  await writeFile(serverPy, 'import sys,os\nsys.path.insert(0,os.environ["CONTABIL_SPED_ROOT"])\nimport dotenv\ndotenv.load_dotenv=lambda *a,**k:False\nimport uvicorn\nfrom webapp.app import app\nuvicorn.run(app,host="127.0.0.1",port=33384)\n');
  await writeFile(workerPy, 'import sys,os,uuid\nsys.path.insert(0,os.environ["CONTABIL_SPED_ROOT"])\nimport dotenv\ndotenv.load_dotenv=lambda *a,**k:False\nfrom webapp import contabil_store as s\nimport agente\nid=str(uuid.UUID(sys.argv[1]))\np=s.consultar("SELECT fila_id FROM contabil_pedidos WHERE id=%s AND tenant_id=%s",(id,os.environ["CONNECT_CONTABIL_TENANT_ID"]),True)\nassert p\nimport db\nitem=next(i for i in db.listar_fila(500) if i["id"]==p["fila_id"])\nagente.executar_item(item)\n');
  pyenv.CONTABIL_SPED_ROOT = sped;
  spedServer = spawn(python, [serverPy], { env: pyenv, cwd: sped, windowsHide: true, stdio: ["ignore",pylog.fd,pylog.fd] });
  servidor = spawn(process.execPath, [path.join(workspace, ".next", "standalone", "server.js")], { env, cwd: path.join(workspace, ".next", "standalone"), windowsHide: true, stdio: ["ignore",log.fd,log.fd] });
  async function aguardar(health) {
    for (let i=0;i<60;i++) { try { if ((await fetch(health)).ok) return; } catch {} await new Promise(r => setTimeout(r,1000)); }
    throw new Error("Servidor não respondeu: " + health);
  }
  await aguardar(base + "/api/health"); await aguardar("http://127.0.0.1:33384/health");
  const instalado = await access(chromium.executablePath()).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(instalado ? {} : { channel: "msedge" }) });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const cookie = (id,role,sectors) => ({ name: "access_token", value: jwt.sign({ sub:id,tenantId,role,sectors,accessibleTenants:[tenantId] }, segredo, { expiresIn:"30m" }), url:base, httpOnly:true, sameSite:"Lax" });
  await ctx.addCookies([cookie(contabilId,"SECTOR_USER",["contabil"]),{name:"active_sector_code",value:"contabil",url:base},{name:"theme",value:"light",url:base}]);
  const page = await ctx.newPage();
  page.on("pageerror",e => resultado.errosDeNavegador.push(e.message));
  page.setDefaultTimeout(30000);
  await page.goto(base + "/contabil/sped");
  await page.getByRole("button",{name:"Conferir período",exact:true}).waitFor();
  const pular = page.getByRole("button",{name:"Pular tutorial",exact:true});
  if (await pular.isVisible()) {
    await pular.click();
    await page.getByRole("dialog").waitFor({state:"hidden"});
  }
  const estabelecimentoCampo = page.getByLabel("Estabelecimento", { exact: true });
  await estabelecimentoCampo.focus(); await page.keyboard.press("Tab");
  assert.ok(await page.getByLabel("Período", { exact: true }).evaluate(e => e === document.activeElement), "Tab passa do estabelecimento para o período");
  await page.screenshot({ animations: "disabled", path:path.join(saida,"evidencias","01-escolher-periodo.png") });
  ok("Módulo do Contábil e escolha do período com os componentes do Connect");
  async function processar(op,acao,recarregarPagina = true) {
    const [r] = await Promise.all([page.waitForResponse(r => r.url().includes("/api/contabil/sped/" + op) && r.request().method()==="POST"), acao()]); const body = await r.json(); assert.ok(r.ok(),JSON.stringify(body)); assert.ok(body.id);
    const proc = spawnSync(python,[workerPy,body.id],{env:pyenv,cwd:sped,windowsHide:true,encoding:"utf8",maxBuffer:1024*1024});
    await writeFile(path.join(saida,"worker-" + op + ".log"),(proc.stdout ?? "") + (proc.stderr ?? ""));
    assert.equal(proc.status,0,proc.stderr || proc.stdout);
    if (recarregarPagina) await page.reload();
  }
  await processar("conferir",() => page.getByRole("button",{name:"Conferir período",exact:true}).click());
  await page.getByRole("heading",{name:"O que foi encontrado",exact:true}).waitFor();
  await page.screenshot({animations:"disabled",path:path.join(saida,"evidencias","02-conferir-dados.png")});
  await page.getByRole("button",{name:"Resolver pendências",exact:true}).click();
  await page.getByRole("heading",{name:"Resolva o que falta",exact:true}).waitFor();
  await page.screenshot({animations:"disabled",path:path.join(saida,"evidencias","03-resolver-pendencias.png")});
  const listaUrl = page.url();
  await page.goBack(); await page.getByRole("heading",{name:"O que foi encontrado",exact:true}).waitFor();
  await page.goForward(); await page.getByRole("heading",{name:"Resolva o que falta",exact:true}).waitFor();
  assert.equal(page.url(), listaUrl, "Voltar e avançar preservam o contexto da lista");
  await page.getByRole("button",{name:"Ver documentos",exact:true}).click();
  await page.getByRole("dialog").getByRole("cell",{name:"9",exact:true}).waitFor();
  assert.ok(await page.getByRole("dialog").evaluate(e => e.contains(document.activeElement)), "Painel recebe o foco");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(page.url(), listaUrl, "Abrir documento preserva URL e filtros");
  assert.ok(await page.getByRole("button",{name:"Ver documentos",exact:true}).evaluate(e => e === document.activeElement), "Foco retorna para a lista");
  ok("Conferência, voltar/avançar e documentos com foco e contexto preservados");
  await page.getByRole("button",{name:"Definir contas",exact:true}).click();
  const painel = page.getByRole("dialog");
  await painel.waitFor();
  await page.screenshot({animations:"disabled",path:path.join(saida,"evidencias","03-definir-contas.png")});
  await painel.getByLabel("Conta de débito",{exact:true}).fill("601");
  await painel.getByLabel("Conta de crédito",{exact:true}).fill("1875");
  const primeiraConsulta = new URL(page.url()).searchParams.get("pedido");
  let liberarRespostaAntiga, confirmarRespostaPresa, confirmarRespostaEntregue;
  const respostaPresa = new Promise(resolve => { confirmarRespostaPresa = resolve; });
  const liberacaoAntiga = new Promise(resolve => { liberarRespostaAntiga = resolve; });
  const respostaEntregue = new Promise(resolve => { confirmarRespostaEntregue = resolve; });
  let segurou = false;
  const pedidosPattern = "**/api/contabil/sped/pedido?**";
  const atrasarConsultaAntiga = async route => {
    if (new URL(route.request().url()).searchParams.get("id") !== primeiraConsulta || segurou) return route.continue();
    segurou = true;
    try {
      const resposta = await route.fetch(); confirmarRespostaPresa();
      await liberacaoAntiga; await route.fulfill({response:resposta});
    } finally { confirmarRespostaEntregue(); }
  };
  await page.route(pedidosPattern, atrasarConsultaAntiga);
  await painel.getByRole("button",{name:"Salvar regra",exact:true}).click();
  await painel.waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Atualizar conferência",exact:true}).waitFor();
  ok("Salvar regra com permissão setorial invalida a conferência anterior");
  await Promise.race([respostaPresa, new Promise((_,reject) => { const timeout = setTimeout(() => reject(new Error("A consulta anterior não foi interceptada")),10000); timeout.unref(); })]);
  await processar("conferir",() => page.getByRole("button",{name:"Atualizar conferência",exact:true}).click(),false);
  await page.getByText("Nenhuma pendência encontrada nos dados consultados. Revise os arquivos antes de gerar.",{exact:true}).waitFor();
  const novaConsulta = new URL(page.url()).searchParams.get("pedido"); assert.notEqual(novaConsulta,primeiraConsulta);
  liberarRespostaAntiga(); await respostaEntregue;
  assert.equal(new URL(page.url()).searchParams.get("pedido"),novaConsulta);
  await page.getByText("Nenhuma pendência encontrada nos dados consultados. Revise os arquivos antes de gerar.",{exact:true}).waitFor();
  await page.unroute(pedidosPattern,atrasarConsultaAntiga);
  ok("Resposta antiga atrasada não substitui a conferência mais recente");
  await page.getByRole("button",{name:"Revisar arquivos",exact:true}).click();
  await page.getByRole("heading",{name:"Revise antes de gerar",exact:true}).waitFor();
  await processar("gerar",() => page.getByRole("button",{name:"Gerar arquivos",exact:true}).click());
  const baixar = page.getByRole("link",{name:/Baixar .*xlsx/});
  await baixar.waitFor(); const download = page.waitForEvent("download"); await baixar.click();
  const arquivo = await download; await arquivo.saveAs(path.join(saida,"evidencias","lancamentos-ficticios.xlsx"));
  ok("Fila e agente reais de teste geram XLSX e o navegador baixa o arquivo");
  await page.screenshot({ animations: "disabled",path:path.join(saida,"evidencias","04-arquivos-gerados.png")});
  for (const [largura,altura,nome] of [[1093,614,"125"],[911,512,"150"],[683,384,"200"],[390,844,"celular"]]) {
    await page.setViewportSize({width:largura,height:altura});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),"Sem rolagem horizontal da página em " + nome);
    await baixar.scrollIntoViewIfNeeded();
    assert.ok(await baixar.evaluate(e => e.scrollHeight <= e.clientHeight + 2), "Texto do download não transborda em " + nome);
    const caixa = await baixar.boundingBox(); assert.ok(caixa && caixa.width <= largura - 24, "Botão de download cabe na área útil em " + nome);
    await page.screenshot({ animations: "disabled",path:path.join(saida,"evidencias","tela-" + nome + ".png")});
  }
  await ctx.addCookies([{name:"theme",value:"dark",url:base}]); await page.reload();
  await baixar.waitFor(); await baixar.scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled",path:path.join(saida,"evidencias","celular-escuro.png")});
  ok("Interface em telas menores, ampliação equivalente e tema escuro");
  await ctx.addCookies([cookie(fiscalId,"SECTOR_USER",["fiscal"])]);
  assert.equal((await ctx.request.get(base + "/api/contabil/sped/contexto")).status(),404);
  await ctx.addCookies([cookie(contabilId,"SECTOR_USER",["contabil"])]);
  const remover = await ctx.request.post(base + "/api/contabil/sped/remover-regra",{headers:{"Idempotency-Key":randomUUID()},data:{contexto:{cnpj:"17122471000175",periodo:"2026-01",tipos:["entradas"],incluir_dominio:true},registro_id:1}});
  assert.equal(remover.status(),403);
  ok("Outro setor não consulta; usuário contábil não pode excluir regras");
  await ctx.addCookies([cookie(adminId,"ADMIN",["contabil"])]);
  await db.query("INSERT INTO tenant_modules (id,tenantId,moduleCode,enabled,updatedAt) VALUES (?,?,'contabil_sped',false,NOW(3))",[randomUUID(),tenantId]);
  assert.equal((await ctx.request.get(base + "/api/contabil/sped/contexto")).status(),404);
  ok("Módulo desligado bloqueia a API mesmo para administrador");
  assert.deepEqual(resultado.errosDeNavegador,[]);
  resultado.sucesso = true;
} finally {
  await writeFile(path.join(saida,"resultado-ui.json"),JSON.stringify(resultado,null,2));
  if (browser) await browser.close(); if (servidor) servidor.kill(); if (spedServer) spedServer.kill();
  await log.close(); await pylog.close(); await db.end();
}
